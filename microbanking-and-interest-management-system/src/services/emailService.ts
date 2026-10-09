"use server";

import { Resend } from "resend";

// Convert the OTP purpose code into a readable operation
function decodePurpose(purpose: string): string {
  switch (purpose) {
    case "BC":
      return "Create Branch";

    case "BU":
      return "Update Branch";

    case "BT":
      return "Toggle Branch Status";

    default:
      return "NULL";
  }
}

// Send the OTP to the designated employee's email
export async function sendOtpEmail(
  recipientEmail: string,
  recipientName: string,
  otpCode: string,
  purpose: string,
  details?: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Check whether the Resend API key is configured
    if (!process.env.RESEND_API_KEY) {
      return {
        success: false,
        message: "RESEND_API_KEY is not configured.",
      };
    }

    // Check whether the sender email is configured
    if (!process.env.EMAIL_FROM) {
      return {
        success: false,
        message: "EMAIL_FROM is not configured.",
      };
    }

    // Create the Resend email client
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Convert the purpose code into a readable name
    const decodedPurpose = decodePurpose(purpose);

    // Format details for HTML email
    const formattedDetails = details
      ? details.replace(/\n/g, '<br/>')
      : null;

    // Send the OTP email
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: [recipientEmail],
      subject: "B-Trust Authorization OTP",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #1e293b;">
          <h2>B-Trust Authorization OTP</h2>

          <p>Hello ${recipientName},</p>

          <p>
            An authorization OTP has been requested for:
            <strong>${decodedPurpose}</strong>
          </p>

          ${
            formattedDetails
              ? `<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; margin: 16px 0; font-size: 13px;">
                  <strong style="display: block; margin-bottom: 6px; color: #0f172a;">Operation Details:</strong>
                  <span>${formattedDetails}</span>
                </div>`
              : ''
          }

          <div style="margin: 20px 0;">
            <span style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; font-weight: bold;">Your One-Time Password</span>
            <h1 style="margin: 4px 0; font-size: 32px; letter-spacing: 4px; color: #2563eb;">${otpCode}</h1>
          </div>

          <p style="font-size: 12px; color: #64748b;">This OTP will expire in 10 minutes. If you did not initiate or authorize this request, please review system security immediately.</p>

          <p style="margin-top: 24px; font-size: 12px; color: #94a3b8;">B-Trust MIMS</p>
        </div>
      `,
    });

    // Handle email sending failure
    if (error) {
      console.error("Email sending error:", error);

      return {
        success: false,
        message: "Failed to send email.",
      };
    }

    return {
      success: true,
      message: "Email sent successfully.",
    };
  } catch (error) {
    console.error("Email service error:", error);

    return {
      success: false,
      message: "Failed to send email.",
    };
  }
}