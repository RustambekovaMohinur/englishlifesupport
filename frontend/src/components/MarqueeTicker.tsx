import React from "react";
import { Flame, Sparkles, Trophy, BookOpen } from "lucide-react";

export const MarqueeTicker: React.FC = () => {
  const items = [
    { icon: Trophy, text: "Top Performer of the Week: J J (+120 ⭐)" },
    { icon: Flame, text: "Intensive IELTS Speaking Cycle is Live!" },
    { icon: Sparkles, text: "Tip: Practice Active Recall for C1 Vocabulary" },
    { icon: BookOpen, text: "Daily Mission: Complete pending assignments before 23:00" },
  ];

  return (
    <div className="relative w-full overflow-hidden bg-slate-900/90 text-slate-300 text-xs font-medium py-2 border-y border-slate-800/60 backdrop-blur-md select-none">
      {/* Gradient edge fades */}
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-slate-900 to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-slate-900 to-transparent z-10 pointer-events-none" />

      <div className="flex w-max animate-marquee space-x-12 whitespace-nowrap">
        {[...items, ...items, ...items].map((item, index) => {
          const Icon = item.icon;
          return (
            <div key={index} className="flex items-center gap-2 text-slate-300">
              <Icon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span>{item.text}</span>
              <span className="text-slate-600 mx-2">•</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
