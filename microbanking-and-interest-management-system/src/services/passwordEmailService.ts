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

export async function sendEmployeePasswordResetEmail(
  data: EmployeePasswordEmail
): Promise<{ success: boolean; message: string }> {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    console.error("Password reset email is not configured: RESEND_API_KEY or EMAIL_FROM is missing.");
    return { success: false, message: "Password reset email service is not configured." };
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: [data.recipientEmail],
      subject: "Your employee account password has been reset",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #0f172a; padding: 20px 24px; color: #ffffff;">
            <h2 style="margin: 0; font-size: 20px; font-weight: 700;">B-Trust Microbanking &amp; Interest Management System</h2>
            <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">Employee password reset notification</p>
          </div>
          <div style="padding: 24px;">
            <p style="font-size: 14px;">Hello <strong>${escapeHtml(data.recipientName)}</strong>,</p>
            <p style="font-size: 14px;">Your employee account password was reset by ${escapeHtml(data.requestingEmployee.name)} (Employee ID: ${data.requestingEmployee.employeeId}, ${escapeHtml(data.requestingEmployee.email)}).</p>
            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
              <span style="font-size: 12px; color: #166534; text-transform: uppercase; font-weight: bold; display: block;">Your new temporary password</span>
              <strong style="margin: 8px 0; font-size: 24px; letter-spacing: 2px; color: #15803d; font-family: monospace;">${escapeHtml(data.temporaryPassword)}</strong>
            </div>
            <p style="font-size: 12px; color: #64748b;">If you did not expect this change, contact system administration.</p>
          </div>
          <div style="background-color: #f8fafc; padding: 12px 24px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
            B-Trust Microbanking &amp; Interest Management System
          </div>
        </div>
      `,
    });

    if (error) {
      console.error("Password reset email sending error:", error);
      return { success: false, message: "Failed to send the password reset email." };
    }

    return { success: true, message: "Password reset email sent successfully." };
  } catch (error: unknown) {
    console.error("Password reset email request failed:", error);
    return { success: false, message: "Failed to send the password reset email." };
  }
}
