import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import nodemailer from 'nodemailer';
import type { OtpPurpose } from './db';

export class OtpDeliveryError extends Error {
  constructor(
    message = 'Failed to deliver one-time password.',
    public status = 502,
    public code = 'OTP_DELIVERY_FAILED'
  ) {
    super(message);
    this.name = 'OtpDeliveryError';
  }
}

export interface EmailDispatchOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  purpose: OtpPurpose;
  otpCode: string;
}

export interface DispatchedEmailRecord {
  to: string;
  purpose: OtpPurpose;
  code: string;
  subject: string;
  timestamp: string;
}

let testDispatchedEmails: DispatchedEmailRecord[] = [];
let mockDeliveryFailure = false;
let mockDeliveryDelayMs = 0;

export function setMockDeliveryFailureForTest(shouldFail: boolean): void {
  mockDeliveryFailure = shouldFail;
}

export function setMockDeliveryDelayForTest(ms: number): void {
  mockDeliveryDelayMs = ms;
}

export function getDispatchedEmailsForTest(): DispatchedEmailRecord[] {
  return [...testDispatchedEmails];
}

export function clearDispatchedEmailsForTest(): void {
  testDispatchedEmails = [];
  mockDeliveryFailure = false;
  mockDeliveryDelayMs = 0;
}

/**
 * Server-side email delivery adapter.
 * Handles production delivery (SMTP/HTTP relay) and development/test fallback.
 */
export async function sendOtpEmail(options: EmailDispatchOptions): Promise<{ success: boolean; provider: string }> {
  if (mockDeliveryDelayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, mockDeliveryDelayMs));
  }

  if (mockDeliveryFailure) {
    throw new OtpDeliveryError('Email delivery service returned an error. Verification code could not be sent.', 502, 'OTP_DELIVERY_FAILED');
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
  const provider = (process.env.EMAIL_PROVIDER || (isProduction ? 'smtp' : isTest ? 'test' : 'console')).toLowerCase();

  // Test mode adapter: fallback when provider is 'test' or when in test environment without an explicit provider override
  if (provider === 'test' || (!process.env.EMAIL_PROVIDER && isTest)) {
    testDispatchedEmails.push({
      to: options.to,
      purpose: options.purpose,
      code: options.otpCode,
      subject: options.subject,
      timestamp: new Date().toISOString(),
    });
    try {
      const dataDir = join(process.cwd(), '.data');
      if (!existsSync(dataDir)) {
        mkdirSync(dataDir, { recursive: true });
      }
      writeFileSync(
        join(dataDir, 'latest_otp.json'),
        JSON.stringify({ to: options.to, purpose: options.purpose, code: options.otpCode, timestamp: new Date().toISOString() }),
        'utf8'
      );
    } catch {
      // Ignore write failure in test sandbox
    }
    return { success: true, provider: 'test' };
  }

  // Production HTTP Webhook / Relay adapter
  if (provider === 'webhook' || provider === 'http') {
    const webhookUrl = process.env.EMAIL_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new OtpDeliveryError('EMAIL_WEBHOOK_URL is not configured for production email delivery.', 502, 'EMAIL_CONFIG_MISSING');
    }
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(process.env.EMAIL_API_KEY ? { Authorization: `Bearer ${process.env.EMAIL_API_KEY}` } : {}),
        },
        body: JSON.stringify({
          to: options.to,
          subject: options.subject,
          text: options.text,
          purpose: options.purpose,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) {
        throw new Error(`Email provider responded with status ${response.status}`);
      }
      return { success: true, provider: 'webhook' };
    } catch (error) {
      console.error('[EMAIL-WEBHOOK-ERROR]', error instanceof Error ? error.message : error);
      throw new OtpDeliveryError(
        'Failed to deliver verification email via provider. Please try again later.',
        502,
        'OTP_DELIVERY_FAILED'
      );
    }
  }

  // Production SMTP adapter with actual nodemailer delivery
  if (provider === 'smtp') {
    const smtpHost = process.env.SMTP_HOST;
    if (!smtpHost) {
      if (isProduction || process.env.EMAIL_PROVIDER === 'smtp') {
        throw new OtpDeliveryError('Production SMTP server is not configured (missing SMTP_HOST).', 502, 'EMAIL_CONFIG_MISSING');
      }
      // In non-production fallback to console if SMTP is unconfigured
      return sendDevOtp(options);
    }

    try {
      const port = Number(process.env.SMTP_PORT || 587);
      const isSecure = process.env.SMTP_SECURE === 'true' || port === 465;
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port,
        secure: isSecure,
        auth: process.env.SMTP_USER ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || '',
        } : undefined,
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 10000,
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'MIMS Security <security@mims.bank>',
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });

      return { success: true, provider: 'smtp' };
    } catch (error) {
      console.error('[EMAIL-SMTP-ERROR]', error instanceof Error ? error.message : error);
      throw new OtpDeliveryError(
        'Failed to deliver verification email via SMTP server. Please try again later.',
        502,
        'OTP_DELIVERY_FAILED'
      );
    }
  }

  // Development & Console mode: safe local logging, NEVER used in production
  if (isProduction) {
    throw new OtpDeliveryError('No valid email delivery provider is configured for production.', 502, 'EMAIL_CONFIG_MISSING');
  }

  return sendDevOtp(options);
}

function sendDevOtp(options: EmailDispatchOptions): { success: boolean; provider: string } {
  if (process.env.NODE_ENV === 'production') {
    throw new OtpDeliveryError('Console delivery is prohibited in production.', 502, 'EMAIL_CONFIG_MISSING');
  }
  console.info(`[MIMS-DEV-OTP] Code for ${options.to} (${options.purpose}): ${options.otpCode}`);
  try {
    const dataDir = join(process.cwd(), '.data');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }
    writeFileSync(
      join(dataDir, 'latest_otp.txt'),
      `=========================================\n  LATEST OTP CODE: ${options.otpCode}\n  Account: ${options.to}\n  Purpose: ${options.purpose}\n  Generated at: ${new Date().toLocaleTimeString()}\n=========================================\n`,
      'utf8'
    );
    writeFileSync(
      join(dataDir, 'latest_otp.json'),
      JSON.stringify({ to: options.to, purpose: options.purpose, code: options.otpCode, timestamp: new Date().toISOString() }),
      'utf8'
    );
  } catch {
    // ignore in development
  }
  return { success: true, provider: 'console' };
}
