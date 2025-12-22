// models/Family.ts
import mongoose, { Schema, model, models } from 'mongoose';

const FamilySchema = new Schema({
  familyId: { type: String, required: true, unique: true, index: true },
  data: { type: Schema.Types.Mixed, default: {} }, // 存储所有 JSON 数据
  lastUpdated: { type: Date, default: Date.now },
});

const Family = models.Family || model('Family', FamilySchema);
export default Family;