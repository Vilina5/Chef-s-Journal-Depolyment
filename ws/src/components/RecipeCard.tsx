import React from 'react';
import { Recipe } from '../types/types';
import  Icon  from './Icon';

interface RecipeCardProps {
  recipe: Recipe;
  onClick: () => void;
}

export const RecipeCard: React.FC<RecipeCardProps> = ({ recipe, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow cursor-pointer overflow-hidden border border-sage-100 flex flex-col h-full"
    >
      <div className="h-40 bg-sage-200 relative overflow-hidden">
        {recipe.image ? (
          <img src={recipe.image} alt={recipe.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-sage-400">
            <Icon name="utensils" className="text-4xl" />
          </div>
        )}
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/60 to-transparent p-3">
          <h3 className="text-white font-semibold text-lg truncate">{recipe.title}</h3>
        </div>
      </div>
      <div className="p-3 flex-1 flex flex-col justify-between">
        <div className="text-sm text-sage-600 line-clamp-2">
           {recipe.ingredients.length} 种食材 • {recipe.steps.length} 个步骤
        </div>
        <div className="mt-2 flex gap-2">
           {recipe.videoUrl && <Icon name="video" className="text-terracotta-500" />}
           {recipe.seasoning && <Icon name="pepper-hot" className="text-terracotta-500" />}
        </div>
      </div>
    </div>
  );
};