import { NextRequest, NextResponse } from 'next/server';
import connectToDatabase from '@/lib/mongodb';
import { User, Family, JoinRequest } from '@/models/Schemas';

export async function GET(req: NextRequest) {
  try {
    await connectToDatabase();
    const { searchParams } = new URL(req.url);
    const familyId = searchParams.get('familyId');
    if (!familyId) return NextResponse.json({ data: [] });

    // 只返回 pending 状态的请求
    const requests = await JoinRequest.find({ targetFamilyId: familyId, status: 'pending' });
    return NextResponse.json({ data: requests });
  } catch (error) {
    console.error("GET Request Error:", error);
    return NextResponse.json({ data: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    await connectToDatabase();
    const body = await req.json();
    const { action } = body;

    // --- A. 发起加入申请 ---
    if (action === 'request') {
      const { phone, name, targetFamilyId } = body;

      const targetFamily = await Family.findOne({ familyId: targetFamilyId });
      if (!targetFamily) return NextResponse.json({ error: '找不到该家庭 ID' }, { status: 404 });
      
      const members = targetFamily.members || []; 
      if (members.includes(phone)) return NextResponse.json({ error: '你已经是该家庭成员了' }, { status: 400 });
      
      const existing = await JoinRequest.findOne({ fromUserPhone: phone, targetFamilyId, status: 'pending' });
      if (existing) return NextResponse.json({ error: '已发送过申请，请等待管理员通过' }, { status: 400 });

      await JoinRequest.create({ fromUserPhone: phone, fromUserName: name, targetFamilyId });
      return NextResponse.json({ success: true });
    }

    // --- B. 同意加入 (核心合并逻辑) ---
    if (action === 'approve') {
      const { requestId } = body;
      const request = await JoinRequest.findById(requestId);
      if (!request || request.status !== 'pending') return NextResponse.json({ error: '请求无效' }, { status: 400 });

      const userPhone = request.fromUserPhone;
      const targetFamilyId = request.targetFamilyId;

      const user = await User.findOne({ phoneNumber: userPhone });
      if (!user) return NextResponse.json({ error: '用户不存在' }, { status: 404 });

      const oldFamily = await Family.findOne({ familyId: user.currentFamilyId });
      const targetFamily = await Family.findOne({ familyId: targetFamilyId });

      if (targetFamily) {
         const oldData = oldFamily?.data || {};
         const targetData = targetFamily.data || {};

         // 1. 合并菜谱 & 日志
         const mergedRecipes = [...(targetData.recipes || []), ...(oldData.recipes || [])];
         const mergedLogs = [...(targetData.mealLogs || []), ...(oldData.mealLogs || [])];
         
         // 2. 准备合并用户
         let currentUsers = targetData.users || [];
         const oldUsers = oldData.users || [];
         
         let allPotentialUsers = [...currentUsers, ...oldUsers];

         // 3. 强制注入当前用户 (兜底：防止旧数据为空)
         const joiningUserObject = {
             id: user._id.toString(), // 确保 ID 存在
             name: user.name,
             phoneNumber: user.phoneNumber,
             color: user.avatarColor || 'bg-blue-500'
         };
         allPotentialUsers.push(joiningUserObject);

         // 4. 用户去重 (【修复点】：变量名统一为 uniqueMap)
         const uniqueMap = new Map();
         allPotentialUsers.forEach(u => {
             const key = u.phoneNumber || u.id;
             if (key) uniqueMap.set(key, u);
         });
         // 从 uniqueMap 取值
         const finalUsers = Array.from(uniqueMap.values());

         // 5. 更新目标家庭数据
         targetFamily.data = { 
             ...targetData, 
             recipes: mergedRecipes, 
             mealLogs: mergedLogs,
             users: finalUsers 
         };
         
         // 6. 更新 members 索引
         if (!targetFamily.members) targetFamily.members = [];
         if (!targetFamily.members.includes(userPhone)) {
             targetFamily.members.push(userPhone);
         }

         targetFamily.markModified('data');
         await targetFamily.save();
      }

      user.currentFamilyId = targetFamilyId;
      await user.save();

      request.status = 'approved';
      await request.save();

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ error: 'Server Error' }, { status: 500 });
  }
}