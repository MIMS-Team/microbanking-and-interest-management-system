import { NextRequest, NextResponse } from 'next/server';
import { createOtp } from '@/services/otpService';
import type { OtpPurpose } from '@/services/otpService';

// Valid OTP purpose codes for branch management operations
const otpPurposes: OtpPurpose[] = ['BC', 'BU', 'BT'];

// POST /api/otp — generate and send an OTP
export async function POST(request: NextRequest) {
  try {
    // Read the request body
    const { purpose, details } = await request.json();

    // Check whether the OTP purpose and operation details are valid
    if (
      typeof purpose !== 'string' ||
      !otpPurposes.includes(purpose as OtpPurpose) ||
      typeof details !== 'string' ||
      !details.trim()
    ) {
      return NextResponse.json(
        {
          success: false,
          message: 'A valid OTP purpose and operation details are required.',
        },
        { status: 400 }
      );
    }

    // Generate and send the OTP to the configured sender for this purpose
    const result = await createOtp(
      purpose as OtpPurpose,
      details
    );

    // Return success or failure response
    return NextResponse.json(
      result,
      { status: result.success ? 200 : 500 }
    );
  } catch (error) {
    // Handle unexpected server errors
    console.error('Error generating branch OTP:', error);

    return NextResponse.json(
      {
        success: false,
        message: 'Failed to generate OTP.',
      },
      { status: 500 }
    );
  }
}