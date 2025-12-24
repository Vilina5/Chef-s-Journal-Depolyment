import mongoose, { Schema, model, models } from 'mongoose';

// 1. 用户模型
const UserSchema = new Schema({
  phoneNumber: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  avatarColor: { type: String },
  currentFamilyId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// 2. 家庭模型
const FamilySchema = new Schema({
  familyId: { type: String, required: true, unique: true, index: true },
  data: { 
    type: Schema.Types.Mixed, 
    default: { recipes: [], plans: [], mealLogs: [], shoppingCart: {} } 
  },
  members: [{ type: String }], 
  owner: { type: String },
  lastUpdated: { type: Date, default: Date.now },
});

// 3. 加入请求模型 (这一步报错的核心原因通常是缺少这个模型处理)
const JoinRequestSchema = new Schema({
  fromUserPhone: { type: String, required: true },
  fromUserName: { type: String, required: true },
  targetFamilyId: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
});

export const User = models.User || model('User', UserSchema);
export const Family = models.Family || model('Family', FamilySchema);
export const JoinRequest = models.JoinRequest || model('JoinRequest', JoinRequestSchema);