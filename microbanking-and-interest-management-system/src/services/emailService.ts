"use server";

import { Resend } from "resend";

// Convert the OTP purpose code into a readable operation
function decodePurpose(purpose: string, details?: string): string {
  switch (purpose) {
    case "BC":
      return "Create Branch";

    case "BU":
      return "Update Branch";

    case "BT": {
      if (details) {
        if (/deactivate/i.test(details)) return "Deactivate Branch";
        if (/activate/i.test(details)) return "Activate Branch";
      }
      return "Toggle Branch Operational Status";
    }

    default:
      return "Administrative Operation";
  }
}

// Send the OTP to the designated employee's email
export async function sendOtpEmail(
  recipientEmail: string,
  recipientName: string,
  otpCode: string,
  purpose: string,
  details?: string,
  requestingEmployee?: {
    name: string;
    email: string;
    phone: string;
    employeeId: number;
  }
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
    const decodedPurpose = decodePurpose(purpose, details);

    // Format details for HTML email
    const formattedDetails = details
      ? details.replace(/\n/g, '<br/>')
      : null;

    // Send the OTP email
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: [recipientEmail],
      subject: `B-Trust Authorization OTP - ${decodedPurpose} by ${requestingEmployee?.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
          <div style="background-color: #0f172a; padding: 20px 24px; color: #ffffff;">
            <h2 style="margin: 0; font-size: 20px; font-weight: 700;">B-Trust Microbanking & Interest Management System</h2>
            <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">Administrative Action Authorization Request</p>
          </div>

          <div style="padding: 24px;">
            <p style="margin: 0 0 16px; font-size: 14px;">Hello <strong>${recipientName}</strong>,</p>

            <p style="margin: 0 0 16px; font-size: 14px;">
              An authorization request has been initiated for the following operational task:
              <br/>
              <span style="display: inline-block; margin-top: 6px; padding: 4px 10px; background-color: #eff6ff; color: #1d4ed8; border-radius: 6px; font-weight: 700; font-size: 13px;">
                ${decodedPurpose}
              </span>
            </p>

            ${
              requestingEmployee
                ? `
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 16px; font-size: 13px;">
                  <strong style="display: block; margin-bottom: 8px; color: #0f172a; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">
                    Requested By:
                  </strong>
                  <table style="width: 100%; font-size: 13px; border-collapse: collapse;">
                    <tr>
                      <td style="padding: 2px 0; color: #64748b; width: 120px;">Employee Name:</td>
                      <td style="padding: 2px 0; font-weight: 600; color: #0f172a;">${requestingEmployee.name}</td>
                    </tr>
                    <tr>
                      <td style="padding: 2px 0; color: #64748b;">Employee ID:</td>
                      <td style="padding: 2px 0; font-weight: 600; color: #0f172a;">${requestingEmployee.employeeId}</td>
                    </tr>
                    <tr>
                      <td style="padding: 2px 0; color: #64748b;">Email Address:</td>
                      <td style="padding: 2px 0; color: #0f172a;">${requestingEmployee.email}</td>
                    </tr>
                    <tr>
                      <td style="padding: 2px 0; color: #64748b;">Phone Number:</td>
                      <td style="padding: 2px 0; color: #0f172a;">${requestingEmployee.phone || 'N/A'}</td>
                    </tr>
                  </table>
                </div>
                `
                : ''
            }

            ${
              formattedDetails
                ? `
                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin-bottom: 20px; font-size: 13px;">
                  <strong style="display: block; margin-bottom: 6px; color: #0f172a; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em;">
                    Operation / Modification Details:
                  </strong>
                  <div style="color: #334155; line-height: 1.5;">${formattedDetails}</div>
                </div>
                `
                : ''
            }

            <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; text-align: center; margin: 20px 0;">
              <span style="font-size: 12px; color: #166534; text-transform: uppercase; letter-spacing: 0.05em; font-weight: bold; display: block;">
                One-Time Authorization Code (OTP)
              </span>
              <h1 style="margin: 8px 0; font-size: 36px; letter-spacing: 6px; color: #15803d; font-family: monospace;">${otpCode}</h1>
              <p style="margin: 4px 0 0; font-size: 12px; color: #166534;">
                This OTP is valid for <strong>10 minutes</strong>. Do not share this token with unauthorized personnel.
              </p>
            </div>

            <p style="font-size: 12px; color: #64748b; margin-top: 20px;">
              If you did not expect this request, please contact system administration immediately.
            </p>
          </div>

          <div style="background-color: #f8fafc; padding: 12px 24px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
            B-Trust Microbanking & Interest Management System (MIMS)
          </div>
        </div>
      `,
    });

    // Handle email sending failure
    if (error) {
      console.error("Email sending error:", error);

      return {
        success: false,
        message: error.message || "Failed to send email.",
      };
    }

    return {
      success: true,
      message: "Email sent successfully.",
    };
  } catch (error: any) {
    console.error("Email service error:", error);

    return {
      success: false,
      message: error?.message || "Failed to send email.",
    };
  }
}