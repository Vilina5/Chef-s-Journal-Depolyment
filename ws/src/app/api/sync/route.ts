import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { Family } from '@/models/Schemas';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const familyId = searchParams.get('familyId');
  if (!familyId) return NextResponse.json({ error: 'Family ID required' }, { status: 400 });

  try {
    await connectToDatabase();
    const record = await Family.findOne({ familyId });
    return NextResponse.json({ data: record ? record.data : null });
  } catch (error) {
    return NextResponse.json({ data: null });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { familyId, data } = body;

    if (!familyId || !data) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

    await connectToDatabase();
    
    // 1. 获取数据库现有数据
    const existingFamily = await Family.findOne({ familyId });
    let finalData = data;

    if (existingFamily && existingFamily.data) {
        const existingData = existingFamily.data;

        // --- A. 合并用户 ---
        const existingUsers = existingData.users || [];
        const incomingUsers = data.users || [];
        const allUsers = [...existingUsers, ...incomingUsers];
        const uniqueUsersMap = new Map();
        allUsers.forEach(u => {
            const key = u.phoneNumber || u.id;
            if (key) uniqueUsersMap.set(key, u);
        });
        const mergedUsers = Array.from(uniqueUsersMap.values());

        // --- B. 合并日记 ---
        const existingLogs = existingData.mealLogs || [];
        const incomingLogs = data.mealLogs || [];
        let mergedLogs = JSON.parse(JSON.stringify(existingLogs));
        incomingLogs.forEach((inLog: any) => {
            const exLogIndex = mergedLogs.findIndex((l: any) => l.date === inLog.date);
            if (exLogIndex > -1) {
                const exLog = mergedLogs[exLogIndex];
                const combinedEntries = [...exLog.entries];
                inLog.entries.forEach((inEntry: any) => {
                    const entryIdx = combinedEntries.findIndex((e: any) => e.userId === inEntry.userId);
                    if (entryIdx > -1) combinedEntries[entryIdx] = inEntry;
                    else combinedEntries.push(inEntry);
                });
                const combinedRecipes = Array.from(new Set([...(exLog.cookedRecipeIds || []), ...(inLog.cookedRecipeIds || [])]));
                mergedLogs[exLogIndex] = { ...exLog, entries: combinedEntries, cookedRecipeIds: combinedRecipes };
            } else {
                mergedLogs.push(inLog);
            }
        });

        // --- C. 【关键修改】合并购物车 (包含单价 unitPrice) ---
        const existingCart = existingData.shoppingCart || {};
        const incomingCart = data.shoppingCart || {};
        
        const mergedCart = { ...incomingCart }; 

        Object.keys(existingCart).forEach(itemId => {
            const oldItem = existingCart[itemId];
            const newItem = mergedCart[itemId];

            if (newItem) {
                mergedCart[itemId] = {
                    ...newItem,
                    // 核心逻辑：如果新数据是0，保留旧数据的金额
                    cost: (newItem.cost === 0 && oldItem.cost > 0) ? oldItem.cost : newItem.cost,
                    unitPrice: (newItem.unitPrice === 0 && oldItem.unitPrice > 0) ? oldItem.unitPrice : newItem.unitPrice,
                    bought: newItem.bought || oldItem.bought
                };
            }
        });

        finalData = {
            ...data,
            users: mergedUsers,
            mealLogs: mergedLogs,
            shoppingCart: mergedCart
        };
    }

    await Family.findOneAndUpdate(
      { familyId },
      { familyId, data: finalData, lastUpdated: new Date() },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Sync Error:", error);
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 });
  }
}