"use server";

import { Resend } from "resend";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

type EmployeePasswordEmail = {
  recipientEmail: string;
  recipientName: string;
  temporaryPassword: string;
  requestingEmployee: {
    employeeId: number;
    name: string;
    email: string;
  };
};
type EmployeeCredentialEmail = {
  recipientEmail: string;
  recipientName: string;
  temporaryPassword: string;
  subject: string;
  heading: string;
  description: string;
  username?: string;
  requestingEmployee?: EmployeePasswordEmail['requestingEmployee'];
};

async function sendEmployeeCredentialEmail(
  data: EmployeeCredentialEmail
): Promise<{ success: boolean; message: string }> {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.error("Employee credential email is not configured: RESEND_API_KEY or EMAIL_FROM is missing.");
    return { success: false, message: "Employee credential email service is not configured." };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: [data.recipientEmail],
      subject: data.subject,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #0f172a; padding: 20px 24px; color: #ffffff;">
            <h2 style="margin: 0; font-size: 20px; font-weight: 700;">B-Trust Microbanking &amp; Interest Management System</h2>
            <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">${escapeHtml(data.heading)}</p>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 14px;">Hello <strong>${escapeHtml(data.recipientName)}</strong>,</p>
            <p style="font-size: 14px;">${escapeHtml(data.description)}</p>
            ${data.username ? `<p style="font-size: 14px;">Username: <strong>${escapeHtml(data.username)}</strong></p>` : ''}
            ${data.requestingEmployee ? `<p style="font-size: 14px;">Password reset by ${escapeHtml(data.requestingEmployee.name)} (Employee ID: ${data.requestingEmployee.employeeId}, ${escapeHtml(data.requestingEmployee.email)}).</p>` : ''}
            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
              <span style="font-size: 12px; color: #166534; text-transform: uppercase; font-weight: bold; display: block;">Your new temporary password</span>
              <strong style="margin: 8px 0; font-size: 24px; letter-spacing: 2px; color: #15803d; font-family: monospace;">${escapeHtml(data.temporaryPassword)}</strong>
            </div>
            <p style="font-size: 12px; color: #64748b;">Change this temporary password after signing in. If you did not expect this email, contact system administration.</p>
          </div>
          <div style="background-color: #f8fafc; padding: 12px 24px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
            B-Trust Microbanking &amp; Interest Management System
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("Employee credential email sending error:", error);
      return { success: false, message: "Failed to send the employee credential email." };
    }

    return { success: true, message: "Employee credential email sent successfully." };
  } catch (error: unknown) {
    console.error("Employee credential email request failed:", error);
    return { success: false, message: "Failed to send the employee credential email." };
  }
}

export async function sendEmployeePasswordResetEmail(
  data: EmployeePasswordEmail
): Promise<{ success: boolean; message: string }> {
  return sendEmployeeCredentialEmail({
    ...data,
    subject: "Your employee account password has been reset",
    heading: "Employee password reset notification",
    description: "Your employee account password was reset.",
  });
}

export async function sendEmployeeTemporaryPasswordEmail(data: {
  recipientEmail: string;
  recipientName: string;
  username: string;
  temporaryPassword: string;
}): Promise<{ success: boolean; message: string }> {
  return sendEmployeeCredentialEmail({
    ...data,
    subject: "Your B-Trust employee account is ready",
    heading: "Employee account credentials",
    description: "Your B-Trust employee account has been created. Use these credentials to sign in.",
  });
}

type CustomerPasswordEmail = {
  recipientEmail: string;
  recipientName: string;
  temporaryPassword: string;
};



// Customer password reset notices, omit the requesting employee's identity.
export async function sendCustomerPasswordResetEmail(
  data: CustomerPasswordEmail
): Promise<{ success: boolean; message: string }> {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.error("Customer password reset email is not configured: RESEND_API_KEY or EMAIL_FROM is missing.");
    return { success: false, message: "Password reset email service is not configured." };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: [data.recipientEmail],
      subject: "Your customer portal password has been reset",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #0f172a; padding: 20px 24px; color: #ffffff;">
            <h2 style="margin: 0; font-size: 20px; font-weight: 700;">B-Trust Microbanking &amp; Interest Management System</h2>
            <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">Customer password reset notification</p>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 14px;">Hello <strong>${escapeHtml(data.recipientName)}</strong>,</p>
            <p style="font-size: 14px;"> Your customer portal password was reset through an authorized account recovery request. </p>
            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
              <span style="font-size: 12px; color: #166534; text-transform: uppercase; font-weight: bold; display: block;">Your new temporary password</span>
              <strong style="margin: 8px 0; font-size: 24px; letter-spacing: 2px; color: #15803d; font-family: monospace;">${escapeHtml(data.temporaryPassword)}</strong>
            </div>
            <p style="font-size: 12px; color: #64748b;">If you did not request or expect this change, contact B-Trust support.</p>
          </div>
          <div style="background-color: #f8fafc; padding: 12px 24px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
            B-Trust Microbanking &amp; Interest Management System
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("Customer password reset email sending error:", error);
      return { success: false, message: "Failed to send the password reset email." };
    }

    return { success: true, message: "Password reset email sent successfully." };
  } catch (error: unknown) {
    console.error("Customer password reset email request failed:", error);
    return { success: false, message: "Failed to send the password reset email." };
  }
}
