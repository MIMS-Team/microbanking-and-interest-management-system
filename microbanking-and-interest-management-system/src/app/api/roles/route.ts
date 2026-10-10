import { NextResponse } from 'next/server';
import { getRoles } from '@/services/roleService';

// GET /api/roles — retrieve roles for employee management
export async function GET() {
  try {
    return NextResponse.json(await getRoles());
  } catch (error) {
    console.error('Error fetching roles:', error);
    return NextResponse.json({ message: 'Failed to fetch roles.' }, { status: 500 });
  }
}
