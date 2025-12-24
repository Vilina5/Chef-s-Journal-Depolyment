
import React, { useState } from 'react';
import { User, Recipe, MealLog } from '../src/types/types';
import { Icon } from './Icon';

interface AdminDashboardProps {
  users: User[];
  recipes: Recipe[];
  logs: MealLog[];
  onBind: (userId: string, partnerId: string) => void;
  onDeleteUser: (userId: string) => void;
  onBack: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  users, 
  recipes, 
  logs, 
  onDeleteUser, 
  onBack 
}) => {
  return (
    <div className="bg-gray-100 min-h-screen text-gray-800 font-sans">
      {/* Header */}
      <div className="bg-gray-900 text-white p-4 shadow-lg flex justify-between items-center sticky top-0 z-50">
        <div className="flex items-center gap-3">
           <div className="bg-terracotta-500 p-2 rounded-lg">
             <Icon name="database" className="text-xl" />
           </div>
           <div>
             <h1 className="font-bold text-lg leading-tight">Chefs Admin</h1>
             <p className="text-xs text-gray-400">后台数据管理系统</p>
           </div>
        </div>
        <button 
          onClick={onBack}
          className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
        >
          <Icon name="arrow-right-from-bracket" /> 退出后台
        </button>
      </div>

      <div className="p-6 max-w-6xl mx-auto space-y-6">
        
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500 mb-1">注册用户总数</p>
                <h3 className="text-3xl font-bold text-gray-900">{users.length}</h3>
              </div>
              <Icon name="users" className="text-blue-500 text-2xl opacity-20" />
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
             <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500 mb-1">存储菜谱数量</p>
                <h3 className="text-3xl font-bold text-gray-900">{recipes.length}</h3>
              </div>
              <Icon name="book" className="text-green-500 text-2xl opacity-20" />
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
             <div className="flex justify-between items-start">
              <div>
                <p className="text-sm text-gray-500 mb-1">日记记录条数</p>
                <h3 className="text-3xl font-bold text-gray-900">{logs.length}</h3>
              </div>
              <Icon name="calendar" className="text-purple-500 text-2xl opacity-20" />
            </div>
          </div>
        </div>

        {/* User Management */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <Icon name="user-group" /> 用户信息表 (User Database)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-500 font-medium">
                <tr>
                  <th className="p-4">头像/名称</th>
                  <th className="p-4">User ID (主键)</th>
                  <th className="p-4 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(u => {
                  return (
                    <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full ${u.color} flex items-center justify-center text-white text-xs font-bold`}>
                            {u.name[0]}
                          </div>
                          <span className="font-medium text-gray-900">{u.name}</span>
                        </div>
                      </td>
                      <td className="p-4 font-mono text-gray-600 select-all">{u.id}</td>
                      <td className="p-4 text-right space-x-2">
                        <button 
                          onClick={() => {
                            if(confirm(`确定要从数据库删除用户 ${u.name} 吗？此操作不可恢复。`)) onDeleteUser(u.id);
                          }}
                          className="text-red-500 hover:text-red-700 text-xs"
                        >
                          <Icon name="trash" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* JSON Console */}
        <div className="grid grid-cols-1 gap-6">
            <div className="bg-gray-800 rounded-xl shadow-sm p-6 text-green-400 font-mono text-xs overflow-y-auto h-64">
                <h3 className="text-gray-400 font-sans font-bold mb-2 flex items-center gap-2">
                    <Icon name="terminal" /> System Logs / JSON Data
                </h3>
                <div className="space-y-1">
                    <p><span className="text-blue-400">[INFO]</span> Database initialized successfully.</p>
                    <p><span className="text-blue-400">[INFO]</span> Loaded {users.length} users from storage.</p>
                    <p><span className="text-blue-400">[INFO]</span> Loaded {recipes.length} recipes.</p>
                    <p className="mt-4 text-gray-500">// Recent User Data Dump:</p>
                    {users.slice(0, 3).map(u => (
                        <div key={u.id} className="ml-2 border-l-2 border-gray-700 pl-2 my-1">
                            {JSON.stringify(u)}
                        </div>
                    ))}
                    {users.length > 3 && <p className="text-gray-500 ml-2">... {users.length - 3} more users</p>}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};
