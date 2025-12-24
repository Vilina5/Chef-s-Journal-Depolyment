import React from 'react';
import { AppView } from '../src/types/types';
import { Icon } from './Icon';

interface BottomNavProps {
  currentView: AppView;
  onChange: (view: AppView) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, onChange }) => {
  const navItems = [
    { id: AppView.RECIPES, icon: 'book-open', label: '菜谱' },
    { id: AppView.SHOPPING, icon: 'basket-shopping', label: '采购' },
    { id: AppView.CALENDAR, icon: 'calendar-days', label: '日记' },
  ];

  return (
    <div className="fixed bottom-0 left-0 w-full bg-white border-t border-sage-200 pb-safe pt-2 px-6 flex justify-between items-center z-50 h-[80px]">
      {navItems.map((item) => {
        const isActive = currentView === item.id || (item.id === AppView.RECIPES && currentView === AppView.RECIPE_EDIT);
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`flex flex-col items-center gap-1 transition-colors ${
              isActive ? 'text-terracotta-600' : 'text-sage-400'
            }`}
          >
            <Icon name={item.icon} className="text-xl" />
            <span className="text-xs font-medium">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
};