"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { AppView, Recipe, DailyPlan, MealLog, Ingredient, ShoppingItem, User, LogEntry } from '../types';
import { generateRecipeDetails, generateRecipeImage } from '../services/geminiService';
import { BottomNav} from '../components/BottomNav';
import {RecipeCard} from '../components/RecipeCard';
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

// 修改 LoginView 组件
const LoginView = ({ onLogin }: { onLogin: (name: string, phone: string) => void }) => {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  // 简单的手机号校验
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
  const [shoppingCart, setShoppingCart] = useState<Record<string, { bought: boolean; cost: number }>>({});
  const [showPlanSelector, setShowPlanSelector] = useState(false);

  // sync state 
  const [familyId, setFamilyId] = useState<string>('');
  const [isOnline, setIsOnline] = useState(true);

  // --- Effects ---
    useEffect(() => {
    const initApp = async () => {
        // 1. 获取或生成 Family ID
        let activeFid = localStorage.getItem('chefs_journal_family_id');
        if (!activeFid) {
            activeFid = uuidv4().slice(0, 8).toUpperCase();
            localStorage.setItem('chefs_journal_family_id', activeFid);
        }
        setFamilyId(activeFid);

        // 2. 优先尝试从云端拉取数据
        const cloudData = await syncService.pullData(activeFid);
        
        if (cloudData) {
            // 云端有数据，直接使用云端数据
            setRecipes(cloudData.recipes || []);
            setPlans(cloudData.plans || []);
            setMealLogs(cloudData.mealLogs || []);
            setUsers(cloudData.users || []);
            setShoppingCart(cloudData.shoppingCart || {});
        } else {
            // 云端是空的（新家庭），加载本地缓存兜底
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
        }
        
        // 恢复当前用户状态
        const savedUserId = localStorage.getItem(STORAGE_KEY_CURRENT_USER_ID);
        const savedPhone = localStorage.getItem('chefs_journal_user_phone');
        
        let foundUser = null;

        // 策略 A: 优先通过 ID 找
        if (cloudData && savedUserId) {
            foundUser = cloudData.users?.find((u: User) => u.id === savedUserId);
        }
        
        // 策略 B: 如果 ID 没找到（可能换了手机），尝试用手机号找
        if (!foundUser && cloudData && savedPhone) {
            foundUser = cloudData.users?.find((u: User) => u.phoneNumber === savedPhone);
            // 如果通过手机号找回了账号，更新本地存储的 ID
            if (foundUser) {
                localStorage.setItem(STORAGE_KEY_CURRENT_USER_ID, foundUser.id);
                console.log("通过手机号找回了老账号:", foundUser.name);
            }
        }

        // 策略 C: 如果是本地初始化
        if (!foundUser && users.length > 0 && savedUserId) {
             foundUser = users.find(u => u.id === savedUserId);
        }

        if (foundUser) {
            setCurrentUser(foundUser);
            // 确保 state 里的 users 也是最新的
            if (cloudData) setUsers(cloudData.users);
        } else {
            // 如果既没有 ID 也没有手机号匹配，说明是纯新设备，去登录页
            setView(AppView.LOGIN);
        }
        // 这里稍微延迟一下设置 user，确保 users 数组已更新
        setTimeout(() => {
             // 重新获取一下最新的 users 状态比较困难，这里依赖后续 render 或简单处理
             // 在实际运行中，users state 更新会触发下方的 useEffect
        }, 0);
    };

    initApp();
  }, []);

  // 恢复用户的辅助 Effect
  useEffect(() => {
      const savedUserId = localStorage.getItem(STORAGE_KEY_CURRENT_USER_ID);
      if (savedUserId && users.length > 0 && !currentUser) {
          const user = users.find(u => u.id === savedUserId);
          if (user) setCurrentUser(user);
          else setView(AppView.LOGIN); // 找不到用户去登录
      }
  }, [users]); // 当 users 同步回来后，自动登录

  // --- Sync Logic: 自动推送 (当本地数据变化时) ---
  useEffect(() => {
    if (!familyId) return;

    const dataPayload: AppState = {
        recipes,
        plans,
        mealLogs,
        users,
        shoppingCart
    };

    // 防抖：1秒内没有操作才保存，避免频繁请求
    const timer = setTimeout(() => {
        syncService.pushData(familyId, dataPayload);
    }, 1000);

    return () => clearTimeout(timer);
  }, [recipes, plans, mealLogs, users, shoppingCart, familyId]);

  // --- Sync Logic: 自动拉取 (实现彼此可见) ---
  useEffect(() => {
    if (!familyId) return;

    // 每 3 秒从服务器拉取一次最新数据
    const interval = setInterval(async () => {
        const cloudData = await syncService.pullData(familyId);
        if (cloudData) {
            // 简单粗暴对比，有变化就更新 (React 会处理 Diff)
            // 注意：正在输入时可能会有轻微冲突，这是简单同步方案的代价
            if (JSON.stringify(cloudData.recipes) !== JSON.stringify(recipes)) setRecipes(cloudData.recipes);
            if (JSON.stringify(cloudData.plans) !== JSON.stringify(plans)) setPlans(cloudData.plans);
            if (JSON.stringify(cloudData.mealLogs) !== JSON.stringify(mealLogs)) setMealLogs(cloudData.mealLogs);
            if (JSON.stringify(cloudData.users) !== JSON.stringify(users)) setUsers(cloudData.users);
            if (JSON.stringify(cloudData.shoppingCart) !== JSON.stringify(shoppingCart)) setShoppingCart(cloudData.shoppingCart);
        }
    }, 3000);

    return () => clearInterval(interval);
  }, [familyId, recipes, plans, mealLogs, users, shoppingCart]);
  // useEffect(() => {
  //   const loadedRecipes = localStorage.getItem(STORAGE_KEY_RECIPES);
  //   const loadedPlans = localStorage.getItem(STORAGE_KEY_PLANS);
  //   const loadedLogs = localStorage.getItem(STORAGE_KEY_LOGS);
  //   const loadedUsers = localStorage.getItem(STORAGE_KEY_USERS);
  //   const currentUserId = localStorage.getItem(STORAGE_KEY_CURRENT_USER_ID);
  //   const cart = localStorage.getItem('shopping_cart');

  //   if (loadedRecipes) setRecipes(JSON.parse(loadedRecipes));
  //   if (loadedPlans) setPlans(JSON.parse(loadedPlans));
  //   if (loadedLogs) {
  //       const rawLogs = JSON.parse(loadedLogs);
  //       const migratedLogs = rawLogs.map((log: any) => {
  //           if (!log.entries && (log.notes || log.photo)) {
  //               return { ...log, entries: [{ userId: 'legacy', notes: log.notes || '', photo: log.photo }] };
  //           }
  //           return log;
  //       });
  //       setMealLogs(migratedLogs);
  //   }

  //   if (loadedUsers) {
  //       const parsedUsers = JSON.parse(loadedUsers);
  //       setUsers(parsedUsers);
  //       if (currentUserId) {
  //           const user = parsedUsers.find((u: User) => u.id === currentUserId);
  //           if (user) {
  //               setCurrentUser(user);
  //               setView(AppView.RECIPES);
  //           } else {
  //               setView(AppView.LOGIN);
  //           }
  //       } else {
  //           setView(AppView.LOGIN);
  //       }
  //   } else {
  //       setView(AppView.LOGIN);
  //   }
    
  //   if(cart) setShoppingCart(JSON.parse(cart));
  // }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_RECIPES, JSON.stringify(recipes));
  }, [recipes]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PLANS, JSON.stringify(plans));
  }, [plans]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(mealLogs));
  }, [mealLogs]);
  
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
  }, [users]);
  
  useEffect(() => {
     localStorage.setItem('shopping_cart', JSON.stringify(shoppingCart));
  }, [shoppingCart]);

// 在 App 组件内
  const handleLogin = (name: string, phone: string) => {
      // 1. 先检查当前已有的 users 里有没有这个手机号
      const existingUser = users.find(u => u.phoneNumber === phone);
      
      if (existingUser) {
          // 如果找到了老用户，直接登录
          setCurrentUser(existingUser);
          localStorage.setItem(STORAGE_KEY_CURRENT_USER_ID, existingUser.id);
      } else {
          // 如果是新用户，创建
          const newUser: User = {
              id: uuidv4().slice(0, 8), 
              name,
              phoneNumber: phone, // [新增]
              color: ['bg-terracotta-500', 'bg-sage-500', 'bg-blue-500', 'bg-pink-500', 'bg-amber-500', 'bg-purple-500'][Math.floor(Math.random() * 6)]
          };
          
          // 更新状态
          const updatedUsers = [...users, newUser];
          setUsers(updatedUsers);
          setCurrentUser(newUser);
          localStorage.setItem(STORAGE_KEY_CURRENT_USER_ID, newUser.id);
      }
      
      // 无论如何，都把手机号存一下，防止刷新丢失
      localStorage.setItem('chefs_journal_user_phone', phone);
      setView(AppView.RECIPES);
  };

  const handleSwitchUser = (userId: string) => {
      const user = users.find(u => u.id === userId);
      if (user) {
          setCurrentUser(user);
          localStorage.setItem(STORAGE_KEY_CURRENT_USER_ID, user.id);
          setView(AppView.RECIPES);
      }
  };

  // --- Handlers: Recipe ---

  const handleCreateRecipe = () => {
    const newRecipe: Recipe = {
      id: uuidv4(),
      title: '',
      ingredients: [],
      steps: [],
      seasoning: '',
      tags: [],
      createdAt: Date.now(),
      createdBy: currentUser?.id
    };
    setEditingRecipe(newRecipe);
    setView(AppView.RECIPE_EDIT);
  };

  const handleEditRecipe = (recipe: Recipe) => {
    setEditingRecipe({ ...recipe });
    setView(AppView.RECIPE_EDIT);
  };

  const handleSaveRecipe = () => {
    if (!editingRecipe || !editingRecipe.title.trim()) return;
    
    setRecipes(prev => {
      const exists = prev.find(r => r.id === editingRecipe.id);
      if (exists) {
        return prev.map(r => r.id === editingRecipe.id ? editingRecipe : r);
      }
      return [...prev, editingRecipe];
    });
    setEditingRecipe(null);
    setView(AppView.RECIPES);
  };

  const handleGenerateAI = async () => {
    if (!editingRecipe?.title) return;
    setIsGenerating(true);
    const generated = await generateRecipeDetails(editingRecipe.title);
    if (generated) {
      setEditingRecipe(prev => ({
        ...prev!,
        title: generated.title || prev!.title,
        ingredients: (generated.ingredients as any[] || []).map(i => ({
          id: uuidv4(),
          name: i.name,
          amount: i.amount,
          estimatedCost: 0,
          purchased: false,
          actualCost: 0
        })),
        steps: generated.steps || [],
        seasoning: generated.seasoning || ''
      }));
    }
    setIsGenerating(false);
  };

  const handleGenerateImage = async () => {
    if (!editingRecipe?.title) return;
    setIsGeneratingImage(true);
    const imageBase64 = await generateRecipeImage(editingRecipe.title);
    if (imageBase64) {
      setEditingRecipe(prev => ({ ...prev!, image: imageBase64 }));
    }
    setIsGeneratingImage(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setEditingRecipe(prev => ({ ...prev!, image: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Handlers: Shopping ---

  const getPlanForDate = (date: string) => plans.find(p => p.date === date);

  const toggleRecipeInPlan = (date: string, recipeId: string) => {
    const existingPlan = getPlanForDate(date);
    // Removed specific lock check for partner, simplified to "lockedBy anyone else"
    if (existingPlan?.lockedBy && existingPlan.lockedBy !== currentUser?.id) {
        const locker = users.find(u => u.id === existingPlan.lockedBy);
        alert(`今日菜单已被 ${locker?.name || '其他家庭成员'} 锁定，无法修改哦~`);
        return;
    }

    setPlans(prev => {
      if (existingPlan) {
        const hasRecipe = existingPlan.recipeIds.includes(recipeId);
        let newIds = hasRecipe 
          ? existingPlan.recipeIds.filter(id => id !== recipeId)
          : [...existingPlan.recipeIds, recipeId];
        
        return prev.map(p => p.date === date ? { ...p, recipeIds: newIds } : p);
      } else {
        return [...prev, { date, recipeIds: [recipeId] }];
      }
    });
  };

  const togglePlanLock = (date: string) => {
      setPlans(prev => {
          const existingPlan = prev.find(p => p.date === date);
          if (!existingPlan) return prev;

          if (existingPlan.lockedBy) {
              if (existingPlan.lockedBy === currentUser?.id) {
                  return prev.map(p => p.date === date ? { ...p, lockedBy: undefined } : p);
              } else {
                  alert("只能由锁定人解锁哦~");
                  return prev;
              }
          } else {
              return prev.map(p => p.date === date ? { ...p, lockedBy: currentUser?.id, lockedAt: Date.now() } : p);
          }
      });
  };

  const handleAddToJournal = () => {
    const plan = getPlanForDate(selectedDate);
    if (!plan || plan.recipeIds.length === 0) return;

    setMealLogs(prev => {
      const existing = prev.find(l => l.date === selectedDate);
      if (existing) {
        const updatedIds = Array.from(new Set([...(existing.cookedRecipeIds || []), ...plan.recipeIds]));
        return prev.map(l => l.date === selectedDate ? { ...l, cookedRecipeIds: updatedIds } : l);
      }
      return [...prev, { 
        id: uuidv4(), 
        date: selectedDate, 
        cookedRecipeIds: plan.recipeIds,
        entries: []
      }];
    });

    alert("已将今日菜单同步到日记！");
  };


  // --- Handlers: Log ---
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, logDate: string) => {
    if (!currentUser) return;
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        updateLogEntry(logDate, { photo: base64 });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateLogNotes = (text: string, logDate: string) => {
     updateLogEntry(logDate, { notes: text });
  };

  const updateLogEntry = (date: string, updates: Partial<LogEntry>) => {
      if (!currentUser) return;
      setMealLogs(prev => {
          const existingLog = prev.find(l => l.date === date);
          if (!existingLog) {
              return [...prev, { 
                  id: uuidv4(), 
                  date, 
                  cookedRecipeIds: [], 
                  entries: [{ userId: currentUser.id, notes: '', ...updates }]
              }];
          }

          const userEntryIndex = existingLog.entries.findIndex(e => e.userId === currentUser.id);
          const newEntries = [...existingLog.entries];
          
          if (userEntryIndex >= 0) {
              newEntries[userEntryIndex] = { ...newEntries[userEntryIndex], ...updates };
          } else {
              newEntries.push({ userId: currentUser.id, notes: '', ...updates });
          }

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
                {users.length > 1 ? `共享成员: ${users.map(u => u.name).join(', ')}` : '我们的共享厨房'}
            </p>
        </div>
        <div className="flex gap-2">
            <button 
                onClick={() => setView(AppView.PROFILE)}
                className={`${currentUser?.color} text-white w-10 h-10 rounded-full flex items-center justify-center shadow-md`}
            >
                {currentUser?.name[0].toUpperCase()}
            </button>
            <button 
                onClick={handleCreateRecipe}
                className="bg-terracotta-500 text-white w-10 h-10 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            >
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
                    {author && (
                        <div className={`absolute top-2 right-2 ${author.color} text-white text-[10px] px-2 py-0.5 rounded-full shadow-sm opacity-90`}>
                            by {author.name}
                        </div>
                    )}
                </div>
              );
          })}
        </div>
      )}
    </div>
  );

  const renderRecipeEdit = () => {
    if (!editingRecipe) return null;
    return (
      <div className="p-4 pb-40 bg-white h-full overflow-y-auto absolute top-0 left-0 w-full z-10">
        <div className="flex items-center justify-between mb-6 sticky top-0 bg-white/95 backdrop-blur py-2 z-20 border-b border-sage-100">
          <button onClick={() => setView(AppView.RECIPES)} className="text-sage-500">
            <Icon name="arrow-left" className="text-xl" />
          </button>
          <h2 className="font-bold text-lg">{editingRecipe.id ? '编辑菜谱' : '新建菜谱'}</h2>
          <button onClick={handleSaveRecipe} className="text-terracotta-600 font-semibold">
            保存
          </button>
        </div>

        <div className="space-y-6">
          <div className="w-full h-48 bg-sage-50 rounded-xl overflow-hidden relative group border border-sage-200">
            {editingRecipe.image ? (
              <img src={editingRecipe.image} alt="Recipe" className="w-full h-full object-cover" />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-sage-400">
                <Icon name="image" className="text-3xl mb-2" />
                <span className="text-sm">暂无图片</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4">
              <label className="cursor-pointer bg-white text-sage-900 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-sage-100 flex items-center gap-2">
                <Icon name="upload" /> 上传
                <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              </label>
              <button 
                onClick={handleGenerateImage}
                disabled={isGeneratingImage || !editingRecipe.title}
                className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
              >
                {isGeneratingImage ? <Icon name="spinner" className="fa-spin" /> : <Icon name="wand-magic-sparkles" />} 
                AI 生成
              </button>
            </div>
          </div>

          <div className="space-y-3">
             <label className="block text-sm font-medium text-sage-700">菜名</label>
             <div className="flex gap-2">
                <input 
                  type="text" 
                  value={editingRecipe.title}
                  onChange={e => setEditingRecipe({...editingRecipe, title: e.target.value})}
                  className="flex-1 p-3 bg-sage-50 rounded-xl border-none focus:ring-2 focus:ring-terracotta-500 outline-none"
                  placeholder="例如：麻婆豆腐"
                />
                <button 
                  onClick={handleGenerateAI}
                  disabled={isGenerating || !editingRecipe.title}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-3 rounded-xl disabled:opacity-50 flex items-center gap-2"
                >
                  {isGenerating ? <Icon name="spinner" className="fa-spin" /> : <Icon name="wand-magic-sparkles" />}
                  <span className="hidden sm:inline">一键生成</span>
                </button>
             </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-sage-700">食材清单</label>
              <button 
                onClick={() => setEditingRecipe({
                  ...editingRecipe, 
                  ingredients: [...editingRecipe.ingredients, { id: uuidv4(), name: '', amount: '', estimatedCost: 0, purchased: false, actualCost: 0 }]
                })}
                className="text-terracotta-600 text-sm font-medium"
              >
                + 添加食材
              </button>
            </div>
            <div className="space-y-2">
              {editingRecipe.ingredients.map((ing, idx) => (
                <div key={ing.id} className="flex gap-2">
                  <input 
                    placeholder="食材名称"
                    value={ing.name}
                    onChange={e => {
                      const newIngs = [...editingRecipe.ingredients];
                      newIngs[idx].name = e.target.value;
                      setEditingRecipe({...editingRecipe, ingredients: newIngs});
                    }}
                    className="flex-1 p-2 bg-sage-50 rounded-lg text-sm"
                  />
                  <input 
                    placeholder="用量"
                    value={ing.amount}
                    onChange={e => {
                      const newIngs = [...editingRecipe.ingredients];
                      newIngs[idx].amount = e.target.value;
                      setEditingRecipe({...editingRecipe, ingredients: newIngs});
                    }}
                    className="w-24 p-2 bg-sage-50 rounded-lg text-sm"
                  />
                   <button 
                    onClick={() => {
                       const newIngs = editingRecipe.ingredients.filter((_, i) => i !== idx);
                       setEditingRecipe({...editingRecipe, ingredients: newIngs});
                    }}
                    className="text-sage-400 hover:text-red-500 px-2"
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              ))}
            </div>
          </div>
          
           <div>
            <div className="flex justify-between items-center mb-2">
              <label className="block text-sm font-medium text-sage-700">烹饪步骤</label>
              <button 
                onClick={() => setEditingRecipe({
                  ...editingRecipe, 
                  steps: [...editingRecipe.steps, '']
                })}
                className="text-terracotta-600 text-sm font-medium"
              >
                + 添加步骤
              </button>
            </div>
            <div className="space-y-3">
              {editingRecipe.steps.map((step, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <span className="text-sage-400 text-sm mt-2 w-5">{idx + 1}.</span>
                  <textarea 
                    value={step}
                    onChange={e => {
                      const newSteps = [...editingRecipe.steps];
                      newSteps[idx] = e.target.value;
                      setEditingRecipe({...editingRecipe, steps: newSteps});
                    }}
                    className="flex-1 p-2 bg-sage-50 rounded-lg text-sm min-h-[60px]"
                    placeholder="描述这个步骤..."
                  />
                  <button 
                    onClick={() => {
                       const newSteps = editingRecipe.steps.filter((_, i) => i !== idx);
                       setEditingRecipe({...editingRecipe, steps: newSteps});
                    }}
                    className="text-sage-400 hover:text-red-500 px-2 mt-2"
                  >
                    <Icon name="trash" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
             <label className="block text-sm font-medium text-sage-700 mb-2">调料配比 & 小贴士</label>
             <textarea 
                value={editingRecipe.seasoning}
                onChange={e => setEditingRecipe({...editingRecipe, seasoning: e.target.value})}
                className="w-full p-3 bg-sage-50 rounded-xl text-sm min-h-[100px]"
                placeholder="例如：生抽 2勺..."
             />
          </div>
          
           <div>
             <label className="block text-sm font-medium text-sage-700 mb-2">参考视频链接</label>
             <input 
                type="text"
                value={editingRecipe.videoUrl || ''}
                onChange={e => setEditingRecipe({...editingRecipe, videoUrl: e.target.value})}
                className="w-full p-3 bg-sage-50 rounded-xl text-sm"
                placeholder="https://..."
             />
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
      if (r) {
        r.ingredients.forEach(ing => {
          allIngredients.push({ ...ing, recipeId: r.id, date: selectedDate });
        });
      }
    });

    const groupedIngredients: Record<string, {name: string; items: ShoppingItem[]}> = {};
    allIngredients.forEach(item => {
      const name = item.name.trim();
      if (!groupedIngredients[name]) groupedIngredients[name] = { name, items: [] };
      groupedIngredients[name].items.push(item);
    });
    const sortedGroups = Object.values(groupedIngredients).sort((a, b) => a.name.localeCompare(b.name));
    
    const totalActual = allIngredients.reduce((sum, item) => sum + (shoppingCart[item.id]?.cost || 0), 0);

    const toggleGroupBought = (items: ShoppingItem[], currentStatus: boolean) => {
      const newCart = { ...shoppingCart };
      const newStatus = !currentStatus;
      items.forEach(item => { newCart[item.id] = { ...(newCart[item.id] || { cost: 0 }), bought: newStatus }; });
      setShoppingCart(newCart);
    };

    const updateGroupCost = (items: ShoppingItem[], newCost: number) => {
      const newCart = { ...shoppingCart };
      items.forEach((item, idx) => {
        newCart[item.id] = { ...(newCart[item.id] || { bought: false, cost: 0 }), cost: idx === 0 ? newCost : 0 };
      });
      setShoppingCart(newCart);
    };

    return (
      <div className="p-4 pb-40 space-y-6 h-full overflow-y-auto no-scrollbar relative">
        <div className="flex justify-between items-center">
           <h1 className="text-2xl font-bold text-sage-900">采购 & 计划</h1>
           <input 
             type="date" 
             value={selectedDate} 
             onChange={e => setSelectedDate(e.target.value)}
             className="bg-white border border-sage-200 rounded-lg px-2 py-1 text-sm text-sage-600 outline-none"
           />
        </div>

        {selectedRecipeIds.length > 0 && (
             <div className={`p-3 rounded-lg flex items-center justify-between ${isLocked ? 'bg-amber-50 border border-amber-200' : 'bg-white border border-sage-100'}`}>
                 <div className="flex items-center gap-2">
                     <Icon name={isLocked ? "lock" : "lock-open"} className={isLocked ? "text-amber-500" : "text-sage-400"} />
                     <span className="text-sm text-sage-700">
                         {isLocked 
                            ? `已由 ${lockedByUser?.name || '家人'} 锁定菜单` 
                            : "菜单开放编辑中"}
                     </span>
                 </div>
                 <button 
                    onClick={() => togglePlanLock(selectedDate)}
                    className={`text-xs px-3 py-1 rounded-full font-medium ${
                        isLocked 
                          ? (canEdit ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-400 cursor-not-allowed")
                          : "bg-sage-100 text-sage-700 hover:bg-sage-200"
                    }`}
                 >
                     {isLocked ? (canEdit ? "解锁" : "无法解锁") : "锁定"}
                 </button>
             </div>
        )}

        <div className="bg-white p-4 rounded-2xl shadow-sm border border-sage-100">
          <div className="flex justify-between items-center mb-3">
             <h3 className="font-semibold text-sage-800">今日菜单</h3>
             <button 
               onClick={() => canEdit && setShowPlanSelector(!showPlanSelector)}
               disabled={!canEdit}
               className={`text-sm font-medium ${canEdit ? 'text-terracotta-600' : 'text-sage-300'}`}
             >
               {showPlanSelector ? '完成选择' : '选择菜谱'}
             </button>
          </div>
          
          {selectedRecipeIds.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedRecipeIds.map(id => {
                const r = recipes.find(x => x.id === id);
                return r ? (
                  <span key={id} className="bg-sage-100 text-sage-800 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                    {r.title}
                    {showPlanSelector && canEdit && (
                      <button onClick={() => toggleRecipeInPlan(selectedDate, id)} className="text-sage-500 hover:text-red-500">
                        <Icon name="xmark" />
                      </button>
                    )}
                  </span>
                ) : null;
              })}
            </div>
          ) : (
             <p className="text-sage-400 text-sm">今天还没有计划做什么菜哦。</p>
          )}

          {showPlanSelector && (
            <div className="mt-4 pt-4 border-t border-sage-100 grid grid-cols-2 gap-2">
              {recipes.map(r => {
                const isSelected = selectedRecipeIds.includes(r.id);
                return (
                  <button 
                    key={r.id}
                    onClick={() => toggleRecipeInPlan(selectedDate, r.id)}
                    className={`p-2 rounded-lg text-sm text-left truncate transition-colors ${
                      isSelected ? 'bg-terracotta-500 text-white' : 'bg-sage-50 text-sage-600 hover:bg-sage-100'
                    }`}
                  >
                    {r.title}
                  </button>
                );
              })}
            </div>
          )}

          {!showPlanSelector && selectedRecipeIds.length > 0 && (
            <div className="mt-4 pt-3 border-t border-sage-100 flex justify-end">
              <button 
                onClick={handleAddToJournal}
                className="text-sm bg-sage-800 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-sage-900 active:scale-95 transition-all"
              >
                <Icon name="check-to-slot" />
                完成烹饪并记录
              </button>
            </div>
          )}
        </div>

        {sortedGroups.length > 0 && (
          <div className="space-y-4">
             <div className="flex justify-between items-end">
               <h3 className="font-semibold text-sage-800">采购清单</h3>
               <div className="text-right">
                  <p className="text-xs text-sage-500">实际花费</p>
                  <p className="font-bold text-terracotta-600">¥{totalActual.toFixed(1)}</p>
               </div>
             </div>

             <div className="space-y-3">
               {sortedGroups.map((group) => {
                 const isBought = group.items.every(item => shoppingCart[item.id]?.bought);
                 const groupCost = group.items.reduce((sum, item) => sum + (shoppingCart[item.id]?.cost || 0), 0);
                 const sourceRecipes = Array.from(new Set(group.items.map(i => recipes.find(rec => rec.id === i.recipeId)?.title).filter(Boolean))).join(', ');
                 const amounts = group.items.map(i => i.amount).join(' + ');

                 return (
                   <div key={group.name} className="bg-white p-3 rounded-xl border border-sage-100 flex items-center gap-3">
                      <button 
                        onClick={() => toggleGroupBought(group.items, isBought)}
                        className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors flex-shrink-0 ${
                          isBought ? 'bg-terracotta-500 border-terracotta-500 text-white' : 'border-sage-300 text-transparent'
                        }`}
                      >
                        <Icon name="check" className="text-xs" />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                           <p className={`font-medium text-sm truncate ${isBought ? 'text-sage-400 line-through' : 'text-sage-800'}`}>{group.name}</p>
                           <span className="text-sage-500 text-xs truncate">{amounts}</span>
                        </div>
                        <p className="text-xs text-sage-400 truncate">来自: {sourceRecipes}</p>
                      </div>
                      {isBought && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="text-xs text-sage-400">¥</span>
                          <input 
                            type="number"
                            value={groupCost || ''}
                            onChange={e => updateGroupCost(group.items, parseFloat(e.target.value))}
                            placeholder="0"
                            className="w-16 p-1 bg-sage-50 rounded text-right text-sm outline-none focus:ring-1 focus:ring-sage-300"
                          />
                        </div>
                      )}
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
    const dates = Array.from({length: 7}, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    }).reverse();

    const chartData = {
       labels: dates.map(d => d.slice(5)),
       datasets: [{
         label: '每日花费',
         data: dates.map(date => {
            const plan = plans.find(p => p.date === date);
            if(!plan) return 0;
            let cost = 0;
            plan.recipeIds.forEach(rid => {
               const r = recipes.find(rec => rec.id === rid);
               r?.ingredients.forEach(ing => {
                   const item = shoppingCart[ing.id];
                   if(item && item.bought) cost += item.cost;
               });
            });
            return cost;
         }),
         backgroundColor: '#e76f51',
         borderRadius: 4,
       }]
    };

    return (
      <div className="p-4 pb-40 space-y-6 h-full overflow-y-auto no-scrollbar">
         <h1 className="text-2xl font-bold text-sage-900">美食日记</h1>
         <div className="bg-white p-4 rounded-2xl shadow-sm border border-sage-100">
           <Bar data={chartData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
         </div>

         <div className="space-y-6">
           {dates.slice().reverse().map(date => {
             const log = mealLogs.find(l => l.date === date);
             const plan = plans.find(p => p.date === date);
             const hasLog = !!log && log.entries.length > 0;
             const hasPlan = plan && plan.recipeIds.length > 0;
             if (!hasLog && !hasPlan) return null;

             const displayRecipeIds = log?.cookedRecipeIds || plan?.recipeIds || [];
             const displayRecipes = displayRecipeIds.map(id => recipes.find(r => r.id === id)).filter(Boolean) as Recipe[];

             // Find if I have an entry, if not, allow adding
             const myEntryExists = log?.entries.find(e => e.userId === currentUser?.id);

             return (
               <div key={date} className="flex gap-3">
                 <div className="w-12 flex-shrink-0 flex flex-col items-center">
                    <span className="text-lg font-bold text-sage-900">{date.slice(8)}</span>
                    <span className="text-xs text-sage-500">{date.slice(5, 7)}月</span>
                    <div className="h-full w-0.5 bg-sage-200 mt-2"></div>
                 </div>
                 
                 <div className="flex-1 pb-6 space-y-3">
                   {displayRecipes.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                           {displayRecipes.map(r => (
                             <span key={r.id} className="text-xs font-semibold text-sage-800 bg-sage-100 px-2 py-1 rounded-md">
                               {r.title}
                             </span>
                           ))}
                        </div>
                   )}
                   
                   <div className="space-y-3">
                      {log?.entries.map((entry, idx) => {
                          const entryUser = users.find(u => u.id === entry.userId);
                          const isMe = entry.userId === currentUser?.id;
                          
                          return (
                              <div key={entry.userId} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs ${entryUser?.color || 'bg-gray-400'}`}>
                                      {entryUser?.name[0]}
                                  </div>
                                  <div className={`flex-1 max-w-[85%] bg-white border border-sage-100 p-2 rounded-xl shadow-sm ${isMe ? 'bg-blue-50/50' : ''}`}>
                                      {/* Photo */}
                                      <div className="w-full aspect-square bg-sage-50 rounded-lg overflow-hidden relative group mb-2">
                                          {entry.photo ? (
                                              <img src={entry.photo} className="w-full h-full object-cover" />
                                          ) : (
                                              <div className="flex items-center justify-center h-full text-sage-300">
                                                  <Icon name="camera" />
                                              </div>
                                          )}
                                          {isMe && (
                                              <label className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                                                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handlePhotoUpload(e, date)} />
                                                  <Icon name="upload" className="text-white" />
                                              </label>
                                          )}
                                      </div>
                                      {/* Notes */}
                                      {isMe ? (
                                           <textarea 
                                              placeholder="写心得..."
                                              value={entry.notes || ''}
                                              onChange={(e) => handleUpdateLogNotes(e.target.value, date)}
                                              className="w-full text-xs bg-transparent outline-none resize-none placeholder-sage-300 text-sage-700 h-10"
                                            />
                                      ) : (
                                           <p className="text-xs text-sage-700 p-1">{entry.notes || '暂无心得'}</p>
                                      )}
                                      {!isMe && <p className="text-[10px] text-sage-400 text-right mt-1">— {entryUser?.name}</p>}
                                  </div>
                              </div>
                          )
                      })}

                      {!myEntryExists && (
                          <button 
                            onClick={() => handleUpdateLogNotes('', date)} 
                            className="w-full py-2 border border-dashed border-sage-300 text-sage-400 rounded-xl text-xs hover:bg-sage-50 transition-colors"
                          >
                            + 添加我的记录
                          </button>
                      )}
                   </div>
                 </div>
               </div>
             );
           })}
         </div>
      </div>
    );
  };

const renderProfile = () => (
      <div className="p-4 bg-sage-50 h-full overflow-y-auto no-scrollbar">
          <button onClick={() => setView(AppView.RECIPES)} className="mb-6 text-sage-500">
            <Icon name="arrow-left" className="text-xl" /> 返回
          </button>
          
          <h1 className="text-2xl font-bold text-sage-900 mb-6">账号管理</h1>
          
          {/* 1. 当前用户信息 (保持不变) */}
          <div className="bg-white p-4 rounded-2xl shadow-sm mb-6">
              <div className="flex items-center gap-4 mb-4">
                  <div className={`w-16 h-16 rounded-full ${currentUser?.color} flex items-center justify-center text-white text-2xl font-bold`}>
                      {currentUser?.name[0].toUpperCase()}
                  </div>
                  <div>
                      <h2 className="font-bold text-lg">{currentUser?.name}</h2>
                      <p className="text-sm text-sage-500 font-mono">ID: {currentUser?.id}</p>
                  </div>
              </div>
          </div>

          {/* 2. 【新增】家庭云同步设置 (插入到这里) */}
          <div className="bg-white p-4 rounded-2xl shadow-sm mb-6 border border-sage-100">
             <div className="flex items-center gap-2 mb-3">
                <Icon name="house-chimney" className="text-terracotta-500" />
                <h3 className="text-sm font-semibold text-sage-700">家庭云同步</h3>
             </div>
             
             {/* 显示当前 ID */}
             <div className="flex flex-col gap-2 mb-4">
                 <label className="text-xs text-sage-500">当前家庭 ID (分享给家人)</label>
                 <div className="flex gap-2">
                    <div className="flex-1 p-3 bg-sage-50 rounded-xl font-mono text-center font-bold text-terracotta-600 border border-sage-200 select-all tracking-widest">
                        {familyId}
                    </div>
                    <button 
                        onClick={() => {
                            navigator.clipboard.writeText(familyId);
                            alert("已复制 ID！发送给家人，让他们在下方输入即可加入。");
                        }}
                        className="bg-sage-200 text-sage-700 px-4 rounded-xl font-medium text-sm hover:bg-sage-300 active:scale-95 transition-transform"
                    >
                        复制
                    </button>
                 </div>
             </div>

             {/* 加入其他 ID */}
             <div className="pt-4 border-t border-sage-100">
                 <label className="text-xs text-sage-500 block mb-2">加入已有家庭 (输入对方 ID)</label>
                 <div className="flex gap-2">
                    <input 
                        type="text" 
                        placeholder="例如: AB12C3"
                        id="join-family-input"
                        className="flex-1 p-2 bg-white border border-sage-200 rounded-xl text-sm outline-none focus:border-terracotta-500 focus:ring-1 focus:ring-terracotta-500 transition-all uppercase"
                    />
                    <button 
                        onClick={() => {
                            const input = document.getElementById('join-family-input') as HTMLInputElement;
                            const newId = input.value.trim().toUpperCase();
                            
                            if (!newId) return alert("请输入家庭 ID");
                            if (newId === familyId) return alert("你已经在这个家庭中了");

                            if(window.confirm(`确定要加入家庭 [${newId}] 吗？\n\n注意：切换后，当前页面的数据将会变成新家庭的数据。`)) {
                                localStorage.setItem('chefs_journal_family_id', newId);
                                window.location.reload(); // 强制刷新以加载新数据
                            }
                        }}
                        className="bg-terracotta-500 text-white px-4 rounded-xl font-medium text-sm shadow-md hover:bg-terracotta-600 active:scale-95 transition-transform"
                    >
                        加入
                    </button>
                 </div>
             </div>
          </div>

{/* 3. 家庭成员名单 (修改版：改为展示模式) */}
          <div className="bg-white p-4 rounded-2xl shadow-sm">
              <h3 className="text-sm font-semibold text-sage-700 mb-4">家庭成员 ({users.length}人)</h3>
              
              <div className="space-y-3">
                  {/* 遍历显示所有人 */}
                  {users.map(u => {
                      const isMe = u.id === currentUser?.id;
                      return (
                          <div 
                            key={u.id}
                            className={`flex items-center justify-between p-2 rounded-xl ${isMe ? 'bg-sage-50 border border-sage-200' : ''}`}
                          >
                              <div className="flex items-center gap-3">
                                  {/* 头像 */}
                                  <div className={`w-10 h-10 rounded-full ${u.color} flex items-center justify-center text-white text-sm shadow-sm ring-2 ring-white`}>
                                      {u.name[0]}
                                  </div>
                                  
                                  {/* 名字和状态 */}
                                  <div className="flex flex-col">
                                      <span className={`text-sm font-medium ${isMe ? 'text-sage-900' : 'text-sage-600'}`}>
                                          {u.name}
                                          {isMe && <span className="ml-2 text-xs text-terracotta-500 font-bold">(我)</span>}
                                      </span>
                                      {/* 显示 ID 后四位，方便区分同名 */}
                                      <span className="text-[10px] text-sage-400">ID: {u.id.slice(0,4)}</span>
                                  </div>
                              </div>

                              {/* 如果是自己，显示一个小圆点状态；如果是别人，暂时不能点（只读） */}
                              {isMe && (
                                  <div className="px-2 py-1 bg-white rounded-md text-[10px] text-sage-500 shadow-sm">
                                      在线
                                  </div>
                              )}
                          </div>
                      );
                  })}
              </div>

              {/* 退出/切换按钮单独放在最下面 */}
              <div className="mt-6 pt-4 border-t border-sage-100">
                  <button 
                    onClick={() => {
                        if(confirm("确定要退出当前账号吗？退出后需要重新登录。")) {
                            localStorage.removeItem(STORAGE_KEY_CURRENT_USER_ID);
                            setView(AppView.LOGIN);
                        }
                    }}
                    className="w-full py-3 text-sm text-sage-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-colors flex items-center justify-center gap-2"
                  >
                    <Icon name="arrow-right-from-bracket" />
                    这不是我的账号？切换/退出
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
    