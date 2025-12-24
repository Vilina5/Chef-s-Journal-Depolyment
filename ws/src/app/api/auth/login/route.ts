import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { User, Family } from '@/models/Schemas';
import { v4 as uuidv4 } from 'uuid';

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const { phone, name } = await req.json();

    if (!phone) return NextResponse.json({ error: '缺少手机号' }, { status: 400 });

    let user = await User.findOne({ phoneNumber: phone });

    // 如果是新用户，注册并创建默认家庭
    if (!user) {
      const newFamilyId = uuidv4().slice(0, 8).toUpperCase();
      
      await Family.create({
        familyId: newFamilyId,
        members: [phone],
        owner: phone,
        data: { recipes: [], plans: [], mealLogs: [], shoppingCart: {} }
      });

      user = await User.create({
        phoneNumber: phone,
        name: name || `用户${phone.slice(-4)}`,
        avatarColor: 'bg-terracotta-500',
        currentFamilyId: newFamilyId
      });
    }

    return NextResponse.json({ 
      success: true, 
      user: {
        id: user._id, // 或者是 user.id，取决于你的 TS 定义
        phoneNumber: user.phoneNumber,
        name: user.name,
        currentFamilyId: user.currentFamilyId,
        color: user.avatarColor || 'bg-terracotta-500' // 确保返回颜色
      }
    });

  } catch (error) {
    console.error("Login Error:", error);
    return NextResponse.json({ error: '登录服务异常' }, { status: 500 });
  }
}