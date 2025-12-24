import { Recipe, DailyPlan, MealLog, User } from '../types';

// 定义整个应用的状态包
export interface AppState {
  recipes: Recipe[];
  plans: DailyPlan[];
  mealLogs: MealLog[];
  users: User[];
  // 购物车在 types.ts 里没有定义接口，这里直接用 Record 定义
  shoppingCart: Record<string, { bought: boolean; cost: number; unitPrice: number}>;
}

export const syncService = {
  // 拉取数据
  async pullData(familyId: string): Promise<AppState | null> {
    try {
      const res = await fetch(`/api/sync?familyId=${familyId}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data;
    } catch (error) {
      console.error('Sync Pull Error:', error);
      return null;
    }
  },

  // 推送数据
  async pushData(familyId: string, data: AppState) {
    try {
      await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ familyId, data }),
      });
    } catch (error) {
      console.error('Sync Push Error:', error);
    }
  }
};