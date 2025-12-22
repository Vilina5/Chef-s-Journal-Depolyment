// app/api/sync/route.ts
import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import Family from '@/models/Family';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const familyId = searchParams.get('familyId');

  if (!familyId) return NextResponse.json({ error: 'Family ID required' }, { status: 400 });

  try {
    await connectToDatabase();
    const record = await Family.findOne({ familyId });
    // 即使没找到也返回 null data，不报错
    return NextResponse.json({ data: record ? record.data : null });
  } catch (error) {
    console.error("DB Error:", error);
    // 临时降级：如果数据库连不上，返回空，避免页面崩溃
    return NextResponse.json({ data: null });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { familyId, data } = body;

    if (!familyId || !data) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

    await connectToDatabase();
    
    // 更新或插入
    await Family.findOneAndUpdate(
      { familyId },
      { familyId, data, lastUpdated: new Date() },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DB Save Error:", error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}