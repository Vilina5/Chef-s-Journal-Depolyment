"use client";

import React, { useState, useEffect } from 'react';
import { AppView, Recipe, DailyPlan, MealLog, ShoppingItem, User, LogEntry } from '../types';
import { generateRecipeDetails, generateRecipeImage } from '../services/geminiService';
import { BottomNav} from '../components/BottomNav';
import { RecipeCard } from '../components/RecipeCard';
import Icon from '../components/Icon';
import { v4 as uuidv4 } from 'uuid';
import './globals.css';
import { syncService, AppState } from '../services/syncService'; 
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// --- Local Storage Keys ---
const STORAGE_KEY_RECIPES = 'chefs_journal_recipes';
const STORAGE_KEY_PLANS = 'chefs_journal_plans';
const STORAGE_KEY_LOGS = 'chefs_journal_logs';
const STORAGE_KEY_USERS = 'chefs_journal_users';
const STORAGE_KEY_CURRENT_USER_ID = 'chefs_journal_current_user_id';

// --- Sub-Components ---
// --- 图片压缩工具函数 ---
// 将图片压缩到最大宽/高 1024px，质量 0.7 (JPEG)
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        // 计算缩放比例
        const maxWidth = 1024; // 限制最大宽度，1024足够清晰且体积小
        const maxHeight = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height *= maxWidth / width));
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width *= maxHeight / height));
            height = maxHeight;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        // 压缩为 JPEG，质量 0.7
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.7);
        resolve(compressedBase64);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
};
// LoginView 组件
const LoginView = ({ onLogin }: { onLogin: (name: string, phone: string) => void }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const isValidPhone = /^1[3-9]\d{9}$/.test(phone);

  return (
      <div className="flex flex-col items-center justify-center h-full p-8 bg-sage-50">
          <div className="mb-8 text-center">
              <div className="bg-white p-4 rounded-full shadow-md inline-block mb-4">
                <Icon name="house-chimney" className="text-4xl text-terracotta-500" />
              </div>
              <h1 className="text-3xl font-bold text-sage-900 mb-2">家庭美食日记</h1>
              <p className="text-sage-500">记录每一餐的温暖与美味</p>
          </div>
          <div className="w-full max-w-xs space-y-4">
              <div>
                <input 
                  type="text" 
                  placeholder="请输入你的昵称" 
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full p-4 rounded-xl border border-sage-200 focus:ring-2 focus:ring-terracotta-500 outline-none text-center"
                />
              </div>
              <div>
                <input 
                  type="tel" 
                  placeholder="请输入手机号 (用于身份识别)" 
                  value={phone}
                  maxLength={11}
                  onChange={e => setPhone(e.target.value)}
                  className="w-full p-4 rounded-xl border border-sage-200 focus:ring-2 focus:ring-terracotta-500 outline-none text-center font-mono"
                />
              </div>
              <button 
                onClick={() => onLogin(name, phone)}
                disabled={!name.trim() || !isValidPhone}
                className="w-full bg-terracotta-500 text-white py-3 rounded-xl font-bold hover:bg-terracotta-600 disabled:opacity-50 transition-colors shadow-lg"
              >
                进入厨房
              </button>
              <p className="text-xs text-center text-sage-400">
                手机号仅用于家庭内部识别，无需验证码
              </p>
          </div>
      </div>
  );
};

const App = () => {
  // --- State ---
  const [view, setView] = useState<AppView>(AppView.LOGIN);
  
  // Data
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [plans, setPlans] = useState<DailyPlan[]>([]);
  const [mealLogs, setMealLogs] = useState<MealLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  
  // User Session
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  // Recipe Edit State
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);

  // Shopping State
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [shoppingCart, setShoppingCart] = useState<Record<string, { bought: boolean; cost: number; unitPrice: number}>>({});
  const [showPlanSelector, setShowPlanSelector] = useState(false);

  // Sync State 
  const [familyId, setFamilyId] = useState<string>('');
  const [pendingRequests, setPendingRequests] = useState<any[]>([]);
  const [userPhone, setUserPhone] = useState<string>('');

  // --- Effects: Initialization ---
  useEffect(() => {
    const initApp = async () => {
        // 1. 获取或生成 Local Family ID (作为兜底)
        let activeFid = localStorage.getItem('chefs_journal_family_id');
        if (!activeFid) {
            activeFid = uuidv4().slice(0, 8).toUpperCase();
            localStorage.setItem('chefs_journal_family_id', activeFid);
        }
        
        // 2. 尝试从云端拉取数据
        // 注意：如果是登录用户，稍后 handleLogin 会覆盖 familyId
        const cloudData = await syncService.pullData(activeFid);
        
        if (cloudData) {
            setRecipes(cloudData.recipes || []);
            setPlans(cloudData.plans || []);
            setMealLogs(cloudData.mealLogs || []);
            setUsers(cloudData.users || []);
            setShoppingCart(cloudData.shoppingCart || {});
            setFamilyId(activeFid);
        } else {
            // 云端为空，加载本地缓存兜底
            const loadedRecipes = localStorage.getItem(STORAGE_KEY_RECIPES);
            const loadedPlans = localStorage.getItem(STORAGE_KEY_PLANS);
            const loadedLogs = localStorage.getItem(STORAGE_KEY_LOGS);
            const loadedUsers = localStorage.getItem(STORAGE_KEY_USERS);
            const cart = localStorage.getItem('shopping_cart');

            if (loadedRecipes) setRecipes(JSON.parse(loadedRecipes));
            if (loadedPlans) setPlans(JSON.parse(loadedPlans));
            if (loadedLogs) setMealLogs(JSON.parse(loadedLogs));
            if (loadedUsers) setUsers(JSON.parse(loadedUsers));
            if (cart) setShoppingCart(JSON.parse(cart));
            setFamilyId(activeFid);
        }
        
        // 恢复登录状态
        const savedPhone = localStorage.getItem('user_phone');
        if (savedPhone) {
            setUserPhone(savedPhone);
            // 这里我们暂时信任本地存储的 phone，实际应用中可能需要校验 token
        }
    };

    initApp();
  }, []);

  // --- Effects: Sync & Requests ---
  
  // 1. 轮询待审批请求 (仅在 Profile 页面)
  useEffect(() => {
    if (view === AppView.PROFILE && familyId) {
      fetch(`/api/family/request?familyId=${familyId}`)
        .then(res => res.json())
        .then(json => setPendingRequests(json.data || []))
        .catch(console.error);
    }
  }, [view, familyId]);

  // 2. 自动推送 (Auto-Save)
  useEffect(() => {
    if (!familyId) return;

    const dataPayload: AppState = {
        recipes,
        plans,
        mealLogs,
        users,
        shoppingCart
    };

    const timer = setTimeout(() => {
        syncService.pushData(familyId, dataPayload);
    }, 1000);

    return () => clearTimeout(timer);
  }, [recipes, plans, mealLogs, users, shoppingCart, familyId]);

  // 3. 自动拉取 (Auto-Pull)
  useEffect(() => {
    if (!familyId) return;

    const interval = setInterval(async () => {
        const cloudData = await syncService.pullData(familyId);
        if (cloudData) {
            // 简单对比更新，防止覆盖正在输入的内容
            if (JSON.stringify(cloudData.recipes) !== JSON.stringify(recipes)) setRecipes(cloudData.recipes);
            if (JSON.stringify(cloudData.plans) !== JSON.stringify(plans)) setPlans(cloudData.plans);
            if (JSON.stringify(cloudData.mealLogs) !== JSON.stringify(mealLogs)) setMealLogs(cloudData.mealLogs);
            if (JSON.stringify(cloudData.users) !== JSON.stringify(users)) setUsers(cloudData.users);
            if (JSON.stringify(cloudData.shoppingCart) !== JSON.stringify(shoppingCart)) setShoppingCart(cloudData.shoppingCart);
        }
    }, 3000);

    return () => clearInterval(interval);
  }, [familyId, recipes, plans, mealLogs, users, shoppingCart]);

  // 4. 用户状态恢复
  useEffect(() => {
      if (currentUser && familyId) {
          setUsers(prevUsers => {
              // 检查当前用户是否在列表中
              const exists = prevUsers.find(u => u.phoneNumber === currentUser.phoneNumber);
              
              if (!exists) {
                  // 如果不在，说明列表数据丢了，强制把自己加进去
                  const fixedUsers = [...prevUsers, currentUser];
                  console.log("检测到用户列表缺失，正在自我修复...", fixedUsers);
                  return fixedUsers;
              }
              return prevUsers;
          });
      }
  }, [currentUser, familyId]); // 只要当前用户或家庭ID变化，就检查一次

  // --- Handlers ---

  const handleLogin = async (name: string, phone: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ name, phone })
      });
      const json = await res.json();
      
      if (json.success) {
        const { user } = json;
        // 关键步骤：
        // 1. 设置当前用户
        setCurrentUser(user);
        setUserPhone(user.phoneNumber);
        // 2. 设置家庭ID (从后端获取的，可能是新建的默认家庭，也可能是已有的)
        setFamilyId(user.currentFamilyId);
        localStorage.setItem('chefs_journal_family_id', user.currentFamilyId);
        localStorage.setItem('user_phone', user.phoneNumber);
        
        // 3. 立即拉取这个家庭的数据
        const cloudData = await syncService.pullData(user.currentFamilyId);
        if (cloudData) {
             setRecipes(cloudData.recipes || []);
             setPlans(cloudData.plans || []);
             setMealLogs(cloudData.mealLogs || []);
             setUsers(cloudData.users || []);
             setShoppingCart(cloudData.shoppingCart || {});
        }

        setView(AppView.RECIPES);
      }
    } catch (e) {
      console.error(e);
      alert("登录失败，请检查网络");
    }
  };

  const handleApprove = async (requestId: string) => {
      const res = await fetch('/api/family/request', {
          method: 'POST',
          body: JSON.stringify({ action: 'approve', requestId })
      });
      const json = await res.json();
      if (json.success) {
          alert("已同意！对方的数据已合并进来。");
          window.location.reload(); // 刷新以加载合并后的数据
      }
  };

  const handleJoinRequest = async () => {
      const input = document.getElementById('join-id-input') as HTMLInputElement;
      const targetId = input.value.trim().toUpperCase();
      if (!targetId) return;

      if (targetId === familyId) {
          alert("你已经在这个家庭中了");
          return;
      }

      try {
        const res = await fetch('/api/family/request', {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'request', 
                phone: userPhone, 
                name: currentUser?.name, 
                targetFamilyId: targetId 
            })
        });

        // --- 错误调试代码 ---
        if (!res.ok) {
            const text = await res.text(); // 先读取文本错误信息
            console.error("API Error:", res.status, text);
            alert(`请求失败 (${res.status}): ${text || '请检查后端文件是否存在'}`);
            return;
        }
        // ------------------

        const json = await res.json();
        if (json.success) {
            alert("申请已发送！请通知对方管理员在“账号管理”页面点击同意。");
            input.value = '';
        } else {
            alert(json.error || "请求失败");
        }
      } catch (e) {
          console.error("Network Error:", e);
          alert("网络请求出错，请按 F12 查看控制台日志");
      }
  };

  const handleSwitchUser = (userId: string) => {
      const user = users.find(u => u.id === userId);
      if (user) {
          setCurrentUser(user);
          setUserPhone(user.phoneNumber || ''); // 更新 phone 状态
          setView(AppView.RECIPES);
      }
  };

  // ... (Recipe Create/Edit Handlers 保持不变)
  const handleCreateRecipe = () => {
    const newRecipe: Recipe = {
      id: uuidv4(), title: '', ingredients: [], steps: [], seasoning: '', tags: [], createdAt: Date.now(), createdBy: currentUser?.id
    };
    setEditingRecipe(newRecipe);
    setView(AppView.RECIPE_EDIT);
  };
  const handleEditRecipe = (recipe: Recipe) => { setEditingRecipe({ ...recipe }); setView(AppView.RECIPE_EDIT); };
  const handleSaveRecipe = () => {
    if (!editingRecipe || !editingRecipe.title.trim()) return;
    setRecipes(prev => {
      const exists = prev.find(r => r.id === editingRecipe.id);
      return exists ? prev.map(r => r.id === editingRecipe.id ? editingRecipe : r) : [...prev, editingRecipe];
    });
    setEditingRecipe(null);
    setView(AppView.RECIPES);
  };
  const handleGenerateAI = async () => {
    if (!editingRecipe?.title) return;
    setIsGenerating(true);
    const generated = await generateRecipeDetails(editingRecipe.title);
    if (generated) {
      setEditingRecipe(prev => ({ ...prev!, title: generated.title || prev!.title, ingredients: (generated.ingredients as any[] || []).map(i => ({ id: uuidv4(), name: i.name, amount: i.amount, estimatedCost: 0, purchased: false, actualCost: 0 })), steps: generated.steps || [], seasoning: generated.seasoning || '' }));
    }
    setIsGenerating(false);
  };
  const handleGenerateImage = async () => {
    if (!editingRecipe?.title) return;
    setIsGeneratingImage(true);
    const imageBase64 = await generateRecipeImage(editingRecipe.title);
    if (imageBase64) setEditingRecipe(prev => ({ ...prev!, image: imageBase64 }));
    setIsGeneratingImage(false);
  };
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        // 使用压缩
        const compressed = await compressImage(file);
        setEditingRecipe(prev => ({ ...prev!, image: compressed }));
      } catch (err) {
        alert("图片处理失败");
      }
    }
  };

  // ... (Shopping & Plan Handlers 保持不变)
  const getPlanForDate = (date: string) => plans.find(p => p.date === date);
  const toggleRecipeInPlan = (date: string, recipeId: string) => {
    const existingPlan = getPlanForDate(date);
    if (existingPlan?.lockedBy && existingPlan.lockedBy !== currentUser?.id) {
        const locker = users.find(u => u.id === existingPlan.lockedBy);
        alert(`已被 ${locker?.name || '其他成员'} 锁定`); return;
    }
    setPlans(prev => existingPlan ? prev.map(p => p.date === date ? { ...p, recipeIds: existingPlan.recipeIds.includes(recipeId) ? existingPlan.recipeIds.filter(id => id !== recipeId) : [...existingPlan.recipeIds, recipeId] } : p) : [...prev, { date, recipeIds: [recipeId] }]);
  };
  const togglePlanLock = (date: string) => {
      setPlans(prev => {
          const existingPlan = prev.find(p => p.date === date);
          if (!existingPlan) return prev;
          if (existingPlan.lockedBy) return existingPlan.lockedBy === currentUser?.id ? prev.map(p => p.date === date ? { ...p, lockedBy: undefined } : p) : prev;
          return prev.map(p => p.date === date ? { ...p, lockedBy: currentUser?.id } : p);
      });
  };
  const handleAddToJournal = () => {
    const plan = getPlanForDate(selectedDate);
    if (!plan || plan.recipeIds.length === 0) return;
    setMealLogs(prev => {
      const existing = prev.find(l => l.date === selectedDate);
      const updatedIds = Array.from(new Set([...(existing?.cookedRecipeIds || []), ...plan.recipeIds]));
      return existing ? prev.map(l => l.date === selectedDate ? { ...l, cookedRecipeIds: updatedIds } : l) : [...prev, { id: uuidv4(), date: selectedDate, cookedRecipeIds: plan.recipeIds, entries: [] }];
    });
    alert("已同步到日记");
  };

  // ... (Log Handlers 保持不变)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>, logDate: string) => {
    if (!currentUser) return;
    const file = e.target.files?.[0];
    if (file) {
      try {
        // 使用压缩
        const compressed = await compressImage(file);
        updateLogEntry(logDate, { photo: compressed });
      } catch (err) {
        alert("图片上传失败");
      }
    }
  };
  const handleUpdateLogNotes = (text: string, logDate: string) => updateLogEntry(logDate, { notes: text });
  const updateLogEntry = (date: string, updates: Partial<LogEntry>) => {
      if (!currentUser) return;
      setMealLogs(prev => {
          const existingLog = prev.find(l => l.date === date);
          if (!existingLog) return [...prev, { id: uuidv4(), date, cookedRecipeIds: [], entries: [{ userId: currentUser.id, notes: '', ...updates }] }];
          const userEntryIndex = existingLog.entries.findIndex(e => e.userId === currentUser.id);
          const newEntries = [...existingLog.entries];
          if (userEntryIndex >= 0) newEntries[userEntryIndex] = { ...newEntries[userEntryIndex], ...updates };
          else newEntries.push({ userId: currentUser.id, notes: '', ...updates });
          return prev.map(l => l.date === date ? { ...l, entries: newEntries } : l);
      });
  };

  // --- Views ---

  const renderRecipes = () => (
    <div className="p-4 pb-40 space-y-4 h-full overflow-y-auto no-scrollbar">
      <div className="flex justify-between items-center mb-6">
        <div>
            <h1 className="text-2xl font-bold text-sage-900">家庭私房菜</h1>
            <p className="text-xs text-sage-500 flex items-center gap-1 mt-1">
                <Icon name="users" className="text-terracotta-500" /> 
                {users.length > 1 ? `共享成员: ${users.map(u => u.name).join(', ')}` : '私房菜模式 (单人)'}
            </p>
        </div>
        <div className="flex gap-2">
            <button onClick={() => setView(AppView.PROFILE)} className={`${currentUser?.color} text-white w-10 h-10 rounded-full flex items-center justify-center shadow-md`}>
                {currentUser?.name?.[0]?.toUpperCase()}
            </button>
            <button onClick={handleCreateRecipe} className="bg-terracotta-500 text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform">
                <Icon name="plus" />
            </button>
        </div>
      </div>
      
      {recipes.length === 0 ? (
        <div className="text-center text-sage-400 mt-20">
          <Icon name="utensils" className="text-6xl mb-4 opacity-50" />
          <p>暂无菜谱。点击 + 号添加。</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {recipes.map(r => {
              const author = users.find(u => u.id === r.createdBy);
              return (
                <div key={r.id} className="relative group">
                    <RecipeCard recipe={r} onClick={() => handleEditRecipe(r)} />
                    {author && <div className={`absolute top-2 right-2 ${author.color} text-white text-[10px] px-2 py-0.5 rounded-full shadow-sm opacity-90`}>by {author.name}</div>}
                </div>
              );
          })}
        </div>
      )}
    </div>
  );

  const renderRecipeEdit = () => {
      // (使用你原来的代码，为了简洁这里省略细节，逻辑复用原来的)
      if (!editingRecipe) return null;
      // ... 保持原有 renderRecipeEdit 逻辑 ...
      // 这里为方便展示，直接拷贝你原来的 renderRecipeEdit 结构即可
      // 重点是上面的 handlers 已经修正
      return (
        <div className="p-4 pb-40 bg-white h-full overflow-y-auto absolute top-0 left-0 w-full z-10">
           {/* ... Header ... */}
           <div className="flex items-center justify-between mb-6 sticky top-0 bg-white/95 backdrop-blur py-2 z-20 border-b border-sage-100">
             <button onClick={() => setView(AppView.RECIPES)} className="text-sage-500"><Icon name="arrow-left" className="text-xl" /></button>
             <h2 className="font-bold text-lg">{editingRecipe.id ? '编辑菜谱' : '新建菜谱'}</h2>
             <button onClick={handleSaveRecipe} className="text-terracotta-600 font-semibold">保存</button>
           </div>
           
           <div className="space-y-6">
              {/* Image */}
              <div className="w-full h-48 bg-sage-50 rounded-xl overflow-hidden relative group border border-sage-200">
                 {editingRecipe.image ? <img src={editingRecipe.image} className="w-full h-full object-cover" /> : <div className="flex flex-col items-center justify-center h-full text-sage-400"><Icon name="image" className="text-3xl" /></div>}
                 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
                    <label className="cursor-pointer bg-white text-sage-900 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-sage-100 flex items-center gap-2">
                       <Icon name="upload" /> 上传 <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                    </label>
                    <button onClick={handleGenerateImage} disabled={isGeneratingImage || !editingRecipe.title} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2">AI 生成</button>
                 </div>
              </div>
              
              {/* Title & AI */}
              <div className="space-y-3">
                 <label className="block text-sm font-medium text-sage-700">菜名</label>
                 <div className="flex gap-2">
                    <input type="text" value={editingRecipe.title} onChange={e => setEditingRecipe({...editingRecipe, title: e.target.value})} className="flex-1 p-3 bg-sage-50 rounded-xl border-none outline-none" placeholder="例如：麻婆豆腐" />
                    <button onClick={handleGenerateAI} disabled={isGenerating || !editingRecipe.title} className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-3 rounded-xl disabled:opacity-50 flex items-center gap-2">{isGenerating ? <Icon name="spinner" className="fa-spin" /> : 'AI 生成'}</button>
                 </div>
              </div>
              
              {/* Ingredients & Steps (Simplification for brevity, use your full code here) */}
               <div>
                <div className="flex justify-between items-center mb-2"><label className="block text-sm font-medium text-sage-700">食材清单</label><button onClick={() => setEditingRecipe({...editingRecipe, ingredients: [...editingRecipe.ingredients, { id: uuidv4(), name: '', amount: '', estimatedCost: 0, purchased: false, actualCost: 0 }]})} className="text-terracotta-600 text-sm font-medium">+ 添加食材</button></div>
                <div className="space-y-2">{editingRecipe.ingredients.map((ing, idx) => (<div key={ing.id} className="flex gap-2"><input value={ing.name} onChange={e => {const n=[...editingRecipe.ingredients];n[idx].name=e.target.value;setEditingRecipe({...editingRecipe,ingredients:n})}} className="flex-1 p-2 bg-sage-50 rounded-lg text-sm" placeholder="食材"/><input value={ing.amount} onChange={e => {const n=[...editingRecipe.ingredients];n[idx].amount=e.target.value;setEditingRecipe({...editingRecipe,ingredients:n})}} className="w-24 p-2 bg-sage-50 rounded-lg text-sm" placeholder="用量"/><button onClick={() => {const n=editingRecipe.ingredients.filter((_,i)=>i!==idx);setEditingRecipe({...editingRecipe,ingredients:n})}} className="text-sage-400"><Icon name="trash" /></button></div>))}</div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-2"><label className="block text-sm font-medium text-sage-700">步骤</label><button onClick={() => setEditingRecipe({...editingRecipe, steps: [...editingRecipe.steps, '']})} className="text-terracotta-600 text-sm font-medium">+ 添加步骤</button></div>
                <div className="space-y-3">{editingRecipe.steps.map((step, idx) => (<div key={idx} className="flex gap-2"><span className="text-sage-400 text-sm mt-2">{idx+1}.</span><textarea value={step} onChange={e => {const n=[...editingRecipe.steps];n[idx]=e.target.value;setEditingRecipe({...editingRecipe,steps:n})}} className="flex-1 p-2 bg-sage-50 rounded-lg text-sm min-h-[60px]" /><button onClick={() => {const n=editingRecipe.steps.filter((_,i)=>i!==idx);setEditingRecipe({...editingRecipe,steps:n})}} className="text-sage-400"><Icon name="trash" /></button></div>))}</div>
              </div>
           </div>
        </div>
      );
  };

const renderShopping = () => {
    const plan = getPlanForDate(selectedDate);
    const selectedRecipeIds = plan?.recipeIds || [];
    const isLocked = !!plan?.lockedBy;
    const lockedByUser = users.find(u => u.id === plan?.lockedBy);
    const canEdit = !isLocked || plan?.lockedBy === currentUser?.id;

    const allIngredients: ShoppingItem[] = [];
    selectedRecipeIds.forEach(rId => {
      const r = recipes.find(x => x.id === rId);
      if (r) r.ingredients.forEach(ing => allIngredients.push({ ...ing, recipeId: r.id, date: selectedDate }));
    });

    const groupedIngredients: Record<string, {name: string; items: ShoppingItem[]}> = {};
    allIngredients.forEach(item => {
      const name = item.name.trim();
      if (!groupedIngredients[name]) groupedIngredients[name] = { name, items: [] };
      groupedIngredients[name].items.push(item);
    });
    const sortedGroups = Object.values(groupedIngredients).sort((a, b) => a.name.localeCompare(b.name));
    
    // 计算总花费
    const totalActual = allIngredients.reduce((sum, item) => sum + (shoppingCart[item.id]?.cost || 0), 0);

    const toggleGroupBought = (items: ShoppingItem[], currentStatus: boolean) => {
      const newCart = { ...shoppingCart };
      const newStatus = !currentStatus;
      items.forEach(item => { 
          // 这里的 { ... } 保证保留原有的 cost 和 unitPrice
          newCart[item.id] = { ...(newCart[item.id] || { cost: 0, unitPrice: 0 }), bought: newStatus }; 
      });
      setShoppingCart(newCart);
    };

    // 更新总价
    const updateGroupCost = (items: ShoppingItem[], newCost: number) => {
      const newCart = { ...shoppingCart };
      items.forEach((item, idx) => {
        const existing = newCart[item.id] || { bought: false, cost: 0, unitPrice: 0 };
        newCart[item.id] = { 
            ...existing, 
            cost: idx === 0 ? newCost : 0, 
            bought: true 
        };
      });
      setShoppingCart(newCart);
    };

    // 【新增】更新单价
    const updateGroupUnitPrice = (items: ShoppingItem[], newPrice: number) => {
      const newCart = { ...shoppingCart };
      items.forEach((item, idx) => {
        const existing = newCart[item.id] || { bought: false, cost: 0, unitPrice: 0 };
        newCart[item.id] = { 
            ...existing, 
            unitPrice: idx === 0 ? newPrice : 0 
        };
      });
      setShoppingCart(newCart);
    };

    return (
      <div className="p-4 pb-40 space-y-6 h-full overflow-y-auto no-scrollbar relative">
        <div className="flex justify-between items-center">
           <h1 className="text-2xl font-bold text-sage-900">采购 & 记账</h1>
           <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="bg-white border border-sage-200 rounded-lg px-2 py-1 text-sm text-sage-600 outline-none font-mono" />
        </div>

        {selectedRecipeIds.length > 0 && (
             <div className={`p-3 rounded-lg flex items-center justify-between ${isLocked ? 'bg-amber-50 border border-amber-200' : 'bg-white border border-sage-100'}`}>
                 <div className="flex items-center gap-2">
                     <Icon name={isLocked ? "lock" : "lock-open"} className={isLocked ? "text-amber-500" : "text-sage-400"} />
                     <span className="text-sm text-sage-700">{isLocked ? `由 ${lockedByUser?.name || '家人'} 锁定` : "清单开放中"}</span>
                 </div>
                 <button onClick={() => togglePlanLock(selectedDate)} className={`text-xs px-3 py-1 rounded-full font-medium ${isLocked ? (canEdit ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-400") : "bg-sage-100 text-sage-700"}`}>{isLocked ? (canEdit ? "解锁" : "无法解锁") : "锁定"}</button>
             </div>
        )}

        <div className="bg-white p-4 rounded-2xl shadow-sm border border-sage-100">
          <div className="flex justify-between items-center mb-3">
             <h3 className="font-semibold text-sage-800">今日菜单</h3>
             <button onClick={() => canEdit && setShowPlanSelector(!showPlanSelector)} disabled={!canEdit} className={`text-sm font-medium ${canEdit ? 'text-terracotta-600' : 'text-sage-300'}`}>{showPlanSelector ? '完成' : '选择菜谱'}</button>
          </div>
          {selectedRecipeIds.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedRecipeIds.map(id => { const r = recipes.find(x => x.id === id); return r ? <span key={id} className="bg-sage-100 text-sage-800 px-3 py-1 rounded-full text-sm flex items-center gap-2">{r.title}{showPlanSelector && canEdit && <button onClick={() => toggleRecipeInPlan(selectedDate, id)}><Icon name="xmark" /></button>}</span> : null; })}
            </div>
          ) : <p className="text-sage-400 text-sm">暂无计划。</p>}
          
          {showPlanSelector && (
            <div className="mt-4 pt-4 border-t border-sage-100 grid grid-cols-2 gap-2">{recipes.map(r => (<button key={r.id} onClick={() => toggleRecipeInPlan(selectedDate, r.id)} className={`p-2 rounded-lg text-sm text-left truncate transition-colors ${selectedRecipeIds.includes(r.id) ? 'bg-terracotta-500 text-white' : 'bg-sage-50 text-sage-600'}`}>{r.title}</button>))}</div>
          )}
          {!showPlanSelector && selectedRecipeIds.length > 0 && (
            <div className="mt-4 pt-3 border-t border-sage-100 flex justify-end"><button onClick={handleAddToJournal} className="text-sm bg-sage-800 text-white px-4 py-2 rounded-lg flex items-center gap-2"><Icon name="check-to-slot" /> 烹饪完成</button></div>
          )}
        </div>

        {sortedGroups.length > 0 && (
          <div className="space-y-4">
             <div className="flex justify-between items-end px-1">
               <h3 className="font-semibold text-sage-800">采购清单</h3>
               <div className="text-right">
                  <p className="text-xs text-sage-500">总花费</p>
                  <p className="font-bold text-terracotta-600 text-xl">¥{totalActual.toFixed(1)}</p>
               </div>
             </div>

             <div className="space-y-3">
               {sortedGroups.map((group) => {
                 const isBought = group.items.every(item => shoppingCart[item.id]?.bought);
                 // 获取该组第一个物品的 cost 和 unitPrice (因为我们只存在第一个上)
                 const firstItem = shoppingCart[group.items[0].id] || { cost: 0, unitPrice: 0 };
                 const groupCost = firstItem.cost;
                 const groupUnitPrice = firstItem.unitPrice;

                 const sourceRecipes = Array.from(new Set(group.items.map(i => recipes.find(rec => rec.id === i.recipeId)?.title).filter(Boolean))).join(', ');
                 const amounts = group.items.map(i => i.amount).join(' + ');

                 return (
                   <div key={group.name} className={`p-3 rounded-xl border flex flex-col gap-2 transition-colors ${isBought ? 'bg-sage-50 border-sage-200' : 'bg-white border-sage-100'}`}>
                      <div className="flex items-center gap-3">
                          <button 
                            onClick={() => toggleGroupBought(group.items, isBought)}
                            className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors flex-shrink-0 ${isBought ? 'bg-terracotta-500 border-terracotta-500 text-white' : 'border-sage-300 text-transparent hover:border-terracotta-500'}`}
                          >
                            <Icon name="check" className="text-sm" />
                          </button>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2">
                              <p className={`font-medium text-base truncate ${isBought ? 'text-sage-400 line-through' : 'text-sage-800'}`}>{group.name}</p>
                              <span className="text-sage-500 text-xs truncate">{amounts}</span>
                            </div>
                            <p className="text-[10px] text-sage-400 truncate mt-0.5">用于: {sourceRecipes}</p>
                          </div>
                      </div>

                      {/* 价格输入区域 */}
                      <div className="flex items-center justify-end gap-2 ml-11 border-t border-sage-50 pt-2 mt-1">
                          
                          {/* 单价输入 */}
                          <div className="flex items-center gap-1 bg-sage-50 rounded px-2 py-1">
                              <span className="text-[10px] text-sage-400">单价</span>
                              <input 
                                type="number"
                                inputMode="decimal"
                                value={groupUnitPrice || ''}
                                onChange={e => updateGroupUnitPrice(group.items, parseFloat(e.target.value) || 0)}
                                placeholder="0"
                                className="w-10 text-right text-xs bg-transparent outline-none text-sage-600"
                              />
                          </div>

                          {/* 总价输入 */}
                          <div className="flex items-center gap-1 bg-white border border-sage-200 rounded px-2 py-1 focus-within:ring-1 focus-within:ring-terracotta-500">
                              <span className="text-xs text-sage-400">总 ¥</span>
                              <input 
                                type="number"
                                inputMode="decimal"
                                value={groupCost || ''}
                                onChange={e => updateGroupCost(group.items, parseFloat(e.target.value) || 0)}
                                placeholder="0"
                                className="w-12 text-right text-sm font-bold text-terracotta-600 outline-none"
                              />
                          </div>
                      </div>
                   </div>
                 );
               })}
             </div>
          </div>
        )}
      </div>
    );
  };
const renderCalendar = () => {
    // 最近7天
    const dates = Array.from({length: 7}, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    // 辅助函数：计算某一天的花费
    const calculateDailyCost = (date: string) => {
        const plan = plans.find(p => p.date === date);
        if (!plan) return 0;
        let cost = 0;
        plan.recipeIds.forEach(rid => {
            const r = recipes.find(rec => rec.id === rid);
            r?.ingredients.forEach(ing => {
                const item = shoppingCart[ing.id];
                if (item) cost += item.cost;
            });
        });
        return cost;
    };

    // 图表数据
    const chartData = {
       labels: dates.map(d => d.slice(5)),
       datasets: [{
         label: '花费',
         data: dates.map(d => calculateDailyCost(d)),
         backgroundColor: '#e76f51',
         borderRadius: 4,
       }]
    };

    return (
      <div className="p-4 pb-40 space-y-6 h-full overflow-y-auto no-scrollbar">
         <h1 className="text-2xl font-bold text-sage-900">美食日记</h1>
         
         <div className="bg-white p-4 rounded-2xl shadow-sm border border-sage-100">
           <Bar data={chartData} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { display: false }, grid: { display: false } }, x: { grid: { display: false } } } }} />
         </div>

         <div className="space-y-6">
           {dates.slice().reverse().map(date => {
             const log = mealLogs.find(l => l.date === date);
             const plan = plans.find(p => p.date === date);
             const dailyCost = calculateDailyCost(date); // 计算当日花费

             // 菜谱列表
             const displayRecipeIds = log?.cookedRecipeIds || plan?.recipeIds || [];
             const displayRecipes = displayRecipeIds.map(id => recipes.find(r => r.id === id)).filter(Boolean) as Recipe[];
             const myEntry = log?.entries.find(e => e.userId === currentUser?.id);
             const isToday = date === new Date().toISOString().split('T')[0];

             return (
               <div key={date} className={`flex gap-3 ${isToday ? 'bg-amber-50/50 -mx-2 p-2 rounded-xl' : ''}`}>
                 {/* 左侧日期 */}
                 <div className="w-12 flex-shrink-0 flex flex-col items-center pt-1">
                    <span className={`text-lg font-bold ${isToday ? 'text-terracotta-600' : 'text-sage-900'}`}>{date.slice(8)}</span>
                    <span className="text-xs text-sage-500">{date.slice(5, 7)}月</span>
                    <div className="h-full w-0.5 bg-sage-200 mt-2"></div>
                 </div>
                 
                 <div className="flex-1 pb-6 space-y-3">
                   {/* 菜谱 & 价格显示 (核心修改点) */}
                   <div className="flex items-center justify-between mb-2">
                       {displayRecipes.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                               {displayRecipes.map(r => (
                                 <span key={r.id} className="text-xs font-semibold text-sage-800 bg-sage-100 px-2 py-1 rounded-md border border-sage-200">
                                   {r.title}
                                 </span>
                               ))}
                            </div>
                       ) : (
                           <span className="text-xs text-sage-300 italic">未记录菜谱</span>
                       )}
                       
                       {/* 显示当日花费 */}
                       {dailyCost > 0 && (
                           <span className="text-xs font-bold text-terracotta-600 bg-white px-2 py-1 rounded-full border border-terracotta-100 shadow-sm whitespace-nowrap">
                               ¥ {dailyCost.toFixed(1)}
                           </span>
                       )}
                   </div>
                   
                   {/* ... (日记内容显示逻辑保持不变) ... */}
                   <div className="space-y-4">
                      {log?.entries.filter(e => e.userId !== currentUser?.id).map((entry) => {
                          const entryUser = users.find(u => u.id === entry.userId);
                          return (
                              <div key={entry.userId} className="flex gap-2">
                                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs ${entryUser?.color || 'bg-gray-400'}`}>{entryUser?.name?.[0]}</div>
                                  <div className="flex-1 bg-white border border-sage-100 p-2 rounded-xl shadow-sm">
                                      {entry.photo && <div className="w-full h-32 mb-2 rounded-lg overflow-hidden bg-gray-100"><img src={entry.photo} className="w-full h-full object-cover" /></div>}
                                      <p className="text-xs text-sage-700 p-1">{entry.notes || '（打卡）'}</p>
                                      <p className="text-[10px] text-sage-400 text-right mt-1">— {entryUser?.name}</p>
                                  </div>
                              </div>
                          );
                      })}
                      <div className="flex gap-2 flex-row-reverse">
                          <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs ${currentUser?.color || 'bg-gray-400'}`}>{currentUser?.name?.[0]}</div>
                          <div className="flex-1 bg-blue-50/50 border border-blue-100 p-3 rounded-xl shadow-sm">
                              <p className="text-xs text-blue-400 mb-2 font-bold">我的记录</p>
                              <div className="w-full aspect-video bg-white rounded-lg overflow-hidden relative group mb-3 border border-dashed border-blue-200 hover:border-blue-400 transition-colors">
                                  {myEntry?.photo ? <img src={myEntry.photo} className="w-full h-full object-cover" /> : <div className="flex flex-col items-center justify-center h-full text-blue-300 gap-1"><Icon name="camera" className="text-xl" /><span className="text-[10px]">点击上传</span></div>}
                                  <label className="absolute inset-0 opacity-0 group-hover:opacity-100 bg-black/10 cursor-pointer flex items-center justify-center transition-opacity"><input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, date)} /></label>
                              </div>
                              <textarea placeholder="记下来..." value={myEntry?.notes || ''} onChange={(e) => handleUpdateLogNotes(e.target.value, date)} className="w-full text-xs bg-white p-2 rounded-lg outline-none border border-blue-100 h-16 resize-none" />
                          </div>
                      </div>
                   </div>
                 </div>
               </div>
             );
           })}
         </div>
      </div>
    );
  };

  // --- Profile Render (已修正核心逻辑) ---
  const renderProfile = () => (
      <div className="p-4 bg-sage-50 h-full overflow-y-auto no-scrollbar">
          <button onClick={() => setView(AppView.RECIPES)} className="mb-6 text-sage-500">
            <Icon name="arrow-left" className="text-xl" /> 返回
          </button>
          
          <h1 className="text-2xl font-bold text-sage-900 mb-6">账号管理</h1>
          
          {/* 1. 当前用户信息 */}
          <div className="bg-white p-4 rounded-2xl shadow-sm mb-6">
              <div className="flex items-center gap-4 mb-4">
                  <div className={`w-16 h-16 rounded-full ${currentUser?.color} flex items-center justify-center text-white text-2xl font-bold`}>
                      {currentUser?.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                      <h2 className="font-bold text-lg">{currentUser?.name}</h2>
                      <p className="text-sm text-sage-500 font-mono">ID: {currentUser?.id?.slice(0,6)}</p>
                      <p className="text-xs text-sage-400">手机: {userPhone}</p>
                  </div>
              </div>
          </div>

          {/* 2. 家庭云同步设置 */}
          <div className="bg-white p-4 rounded-2xl shadow-sm mb-6 border border-sage-100">
             <div className="flex items-center gap-2 mb-3">
                <Icon name="house-chimney" className="text-terracotta-500" />
                <h3 className="text-sm font-semibold text-sage-700">家庭云同步</h3>
             </div>
             
             {/* 显示当前家庭 ID */}
             <div className="flex flex-col gap-2 mb-4">
                 <label className="text-xs text-sage-500">当前家庭 ID (分享给家人)</label>
                 <div className="flex gap-2">
                    <div className="flex-1 p-3 bg-sage-50 rounded-xl font-mono text-center font-bold text-terracotta-600 border border-sage-200 select-all tracking-widest">
                        {familyId}
                    </div>
                    <button 
                        onClick={() => { navigator.clipboard.writeText(familyId); alert("已复制 ID！发送给家人，让他们在下方输入即可加入。"); }}
                        className="bg-sage-200 text-sage-700 px-4 rounded-xl font-medium text-sm hover:bg-sage-300 active:scale-95 transition-transform"
                    >
                        复制
                    </button>
                 </div>
             </div>

             {/* 待处理消息 (New) */}
             {pendingRequests.length > 0 && (
                <div className="mb-4 bg-amber-50 border border-amber-200 p-3 rounded-xl animate-pulse-slow">
                    <h3 className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1"><Icon name="bell" /> 新成员申请</h3>
                    <div className="space-y-2">
                        {pendingRequests.map(req => (
                            <div key={req._id} className="flex items-center justify-between bg-white p-2 rounded-lg shadow-sm">
                                <span className="text-sm truncate mr-2">
                                    <span className="font-bold">{req.fromUserName}</span> 想加入
                                </span>
                                <button 
                                    onClick={() => handleApprove(req._id)}
                                    className="bg-amber-500 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap shadow-sm active:scale-95"
                                >
                                    同意
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
             )}

             {/* 申请加入其他家庭 */}
             <div className="pt-4 border-t border-sage-100">
                 <label className="text-xs text-sage-500 block mb-2">加入已有家庭 (输入对方 ID)</label>
                 <div className="flex gap-2">
                    <input 
                        type="text" 
                        placeholder="例如: AB12C3"
                        id="join-id-input"
                        className="flex-1 p-2 bg-white border border-sage-200 rounded-xl text-sm outline-none focus:border-terracotta-500 focus:ring-1 focus:ring-terracotta-500 transition-all uppercase"
                    />
                    <button 
                        onClick={handleJoinRequest}
                        className="bg-terracotta-500 text-white px-4 rounded-xl font-medium text-sm shadow-md hover:bg-terracotta-600 active:scale-95 transition-transform"
                    >
                        申请加入
                    </button>
                 </div>
                 <p className="text-[10px] text-sage-400 mt-2">提示：申请通过后，你的私房菜谱会自动合并过去。</p>
             </div>
          </div>

          {/* 3. 家庭成员名单 */}
          <div className="bg-white p-4 rounded-2xl shadow-sm">
              <h3 className="text-sm font-semibold text-sage-700 mb-4">家庭成员 ({users.length}人)</h3>
              <div className="space-y-3">
                  {users.map(u => {
                      const isMe = u.id === currentUser?.id;
                      return (
                          <div key={u.id} className={`flex items-center justify-between p-2 rounded-xl ${isMe ? 'bg-sage-50 border border-sage-200' : ''}`}>
                              <div className="flex items-center gap-3">
                                  <div className={`w-10 h-10 rounded-full ${u.color} flex items-center justify-center text-white text-sm shadow-sm ring-2 ring-white`}>{u.name?.[0]}</div>
                                  <div className="flex flex-col">
                                      <span className={`text-sm font-medium ${isMe ? 'text-sage-900' : 'text-sage-600'}`}>{u.name}{isMe && <span className="ml-2 text-xs text-terracotta-500 font-bold">(我)</span>}</span>
                                      <span className="text-[10px] text-sage-400">ID: {u.id?.slice(0,4)}</span>
                                  </div>
                              </div>
                              {isMe && <div className="px-2 py-1 bg-white rounded-md text-[10px] text-sage-500 shadow-sm">在线</div>}
                          </div>
                      );
                  })}
              </div>
              <div className="mt-6 pt-4 border-t border-sage-100">
                  <button onClick={() => { if(confirm("确定要退出当前账号吗？")) { localStorage.removeItem(STORAGE_KEY_CURRENT_USER_ID); localStorage.removeItem('user_phone'); setView(AppView.LOGIN); } }} className="w-full py-3 text-sm text-sage-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors flex items-center justify-center gap-2">
                    <Icon name="arrow-right-from-bracket" /> 退出登录 / 切换账号
                  </button>
              </div>
          </div>
      </div>
  );

  return (
    <>
      <div className="h-full bg-sage-50">
        {view === AppView.LOGIN && <LoginView onLogin={handleLogin} />}
        {view === AppView.RECIPES && renderRecipes()}
        {view === AppView.RECIPE_EDIT && renderRecipeEdit()}
        {view === AppView.SHOPPING && renderShopping()}
        {view === AppView.CALENDAR && renderCalendar()}
        {view === AppView.PROFILE && renderProfile()}
      </div>
      
      {[AppView.RECIPES, AppView.SHOPPING, AppView.CALENDAR].includes(view) && (
        <BottomNav currentView={view} onChange={setView} />
      )}
    </>
  );
};

export default App;