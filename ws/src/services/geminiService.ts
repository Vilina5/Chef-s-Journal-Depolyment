// 代理到后端API，前端不再直接调用AI服务
export async function generateRecipeDetails(dishName: string) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: `请为 "${dishName}" 创建一份详细的食谱。包含食材（注明典型用量，如克、个、勺）、详细的分步烹饪说明以及调料配比。请使用中文回答。`
    })
  });
  if (!res.ok) return null;
  try {
    const data = await res.json();
    // 解析 Gemini 返回格式，适配前端 Recipe 结构
    if (data && data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
      return JSON.parse(data.candidates[0].content.parts[0].text);
    }
    return null;
  } catch {
    return null;
  }
}

export async function generateRecipeImage(dishName: string) {
  // 可扩展为后端API代理图片生成
  return null;
}
