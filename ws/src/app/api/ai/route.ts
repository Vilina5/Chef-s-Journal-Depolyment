import { NextRequest, NextResponse } from 'next/server';
import { HttpsProxyAgent } from 'https-proxy-agent';
import nodeFetch from 'node-fetch'; 

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { prompt, type = 'text' } = body;

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required.' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API key not configured.' }, { status: 500 });
    }

    // --- 1. 配置代理 (保持不变) ---
    // 你的端口是 10077
    const proxyUrl = 'http://127.0.0.1:10077'; 
    let agent: any = undefined;
    if (process.env.NODE_ENV === 'development') {
       agent = new HttpsProxyAgent(proxyUrl);
    }

    
    const baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';

    // --- 2. 处理图片生成 (严格复刻你的 SDK 代码逻辑) ---
    if (type === 'image') {
      const modelName = 'gemini-2.5-flash-image'; 
      
      // 注意：这里使用 generateContent，而不是 predict，完全匹配你的参考代码
      const url = `${baseUrl}/${modelName}:generateContent?key=${apiKey}`;

      const payload = {
        contents: {
          parts: [
            {
              text: `一张美味的 "${prompt}" 的特写照片，专业美食摄影，高分辨率，光线柔和，看起来让人食欲大开。`,
            },
          ],
        }
      };

      console.log(`正在请求 Google 图片生成 (模型: ${modelName}, 代理: ${agent ? '开启' : '关闭'})...`);

      // @ts-ignore
      const response = await nodeFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        agent: agent,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Image Gen Error:', response.status, errorText);
        return NextResponse.json({ error: `Image Gen Error: ${errorText}` }, { status: response.status });
      }

      const data: any = await response.json();
      
      // --- 解析逻辑复刻 ---
      // 查找 inlineData (Base64)
      let base64String = null;
      const parts = data.candidates?.[0]?.content?.parts || [];
      
      for (const part of parts) {
        if (part.inlineData) {
          base64String = part.inlineData.data;
          break; // 找到即停止
        }
      }

      if (!base64String) {
        console.error("AI 返回结构:", JSON.stringify(data, null, 2));
        throw new Error('生成的图片数据为空 (未找到 inlineData)');
      }

      return NextResponse.json({ 
        data: { imageBase64: `data:image/png;base64,${base64String}` } 
      });
    }

    // --- 3. 处理文本/菜谱生成 (保持不变) ---
    const modelName = 'gemini-2.5-flash';
    const url = `${baseUrl}/${modelName}:generateContent?key=${apiKey}`;

    const systemInstruction = `
      你是一位专业的大厨。请根据用户输入的菜名生成详细菜谱。
      
      【重要规则】
      1. 必须完全使用 JSON 格式返回。
      2. 语言必须是：简体中文 (Simplified Chinese)。
      3. "ingredients" 必须是一个对象数组，每个对象包含 "name" (食材名) 和 "amount" (用量)。
      4. "steps" 必须是一个字符串数组。
      
      【JSON 结构示例】
      {
        "name": "西红柿炒鸡蛋",
        "description": "一道家常经典菜肴，酸甜可口。",
        "ingredients": [
          { "name": "鸡蛋", "amount": "3个" },
          { "name": "西红柿", "amount": "2个" },
          { "name": "盐", "amount": "适量" }
        ],
        "steps": ["西红柿切块，鸡蛋打散。", "热锅凉油炒鸡蛋。", "混合翻炒出锅。"]
      }
    `;

    const payload = {
      contents: [{ 
        parts: [{ text: `请生成这道菜的菜谱: ${prompt}` }] 
      }],
      systemInstruction: {
          parts: [{ text: systemInstruction }]
      },
      generationConfig: {
          responseMimeType: "application/json"
      }
    };

    console.log(`正在请求 Google Gemini API (菜名: ${prompt})...`);

    // @ts-ignore
    const response = await nodeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      agent: agent,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error:', response.status, errorText);
      return NextResponse.json({ error: `Gemini API Error: ${errorText}` }, { status: response.status });
    }

    const rawData: any = await response.json();
    const textResponse = rawData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textResponse) {
        throw new Error('AI 未返回内容');
    }

    let finalData;
    try {
        finalData = JSON.parse(textResponse);
    } catch (e) {
        console.error("JSON 解析失败:", textResponse);
        throw new Error('AI 返回的格式不是有效的 JSON');
    }

    return NextResponse.json({ data: finalData });

  } catch (error) {
    console.error('Route Handler Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) }, 
      { status: 500 }
    );
  }
}