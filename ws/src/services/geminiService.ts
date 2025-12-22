// services/geminiService.ts
import { Recipe } from '../types';

// services/geminiService.ts - 以 generateRecipeDetails 为例修改
export async function generateRecipeDetails(dishName: string): Promise<Partial<Recipe> | null> {
  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: dishName, type: 'text' })
    });

     // 关键：先检查响应是否为 JSON 格式
    const contentType = response.headers.get('Content-Type');
    if (!contentType || !contentType.includes('application/json')) {
      const raw = await response.text();
      throw new Error(`API 返回非 JSON 内容（状态码：${response.status}）：${raw.slice(0, 100)}`);
    }

    // 确认是 JSON 后再解析
    const result = await response.json(); // 改用 response.json()，而非手动 parse
    
    if (!response.ok) {
      throw new Error(result.error || '生成菜谱失败');
    }

    return result.data;
  } catch (error) {
    console.error('生成菜谱详情错误:', error);
    // 友好提示用户
    alert('生成菜谱失败：' + (error instanceof Error ? error.message : '未知错误'));
    return null;
  }
}
// 生成菜谱图片
export async function generateRecipeImage(dishName: string): Promise<string | null> {
  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: dishName, // 修复：参数名从dishName改为prompt，与后端匹配
        type: 'image'
      })
    });

    const result = await response.json();
    
    if (!response.ok) {
      throw new Error(result.error || '生成图片失败');
    }

    // 接收后端返回的图片URL或base64
    return result.data?.imageUrl || result.data?.imageBase64 || null;
  } catch (error) {
    console.error('生成菜谱图片错误:', error);
    return null;
  }
}