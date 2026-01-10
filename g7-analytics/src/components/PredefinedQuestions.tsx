"use client";

import { PredefinedQuestion } from "@/types";

// Icônes par catégorie
function CategoryIcon({ icon }: { icon: string }) {
  const icons: Record<string, string> = {
    "⭐": "⭐",
    "🏆": "🏆",
    "📈": "📈",
    "🔍": "🔍",
  };
  return <span className="mr-2">{icons[icon] || "💬"}</span>;
}

interface PredefinedQuestionsProps {
  questions: PredefinedQuestion[];
  onQuestionClick: (q: string) => void;
}

export function PredefinedQuestions({ questions, onQuestionClick }: PredefinedQuestionsProps) {
  // Grouper questions par catégorie
  const questionsByCategory = questions.reduce(
    (acc, q) => {
      if (!acc[q.category]) acc[q.category] = [];
      acc[q.category].push(q);
      return acc;
    },
    {} as Record<string, PredefinedQuestion[]>
  );

  if (questions.length === 0) return null;

  return (
    <>
      {Object.entries(questionsByCategory).map(([category, categoryQuestions]) => (
        <div key={category}>
          <h4 className="text-xs font-medium text-primary/80 mb-2 flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-primary" />
            {category}
          </h4>
          <div className="space-y-1">
            {categoryQuestions.map((q) => (
              <button
                key={q.id}
                onClick={() => onQuestionClick(q.question)}
                className="w-full text-left text-sm p-2.5 rounded-lg hover:bg-secondary/50 hover:border-primary/20 border border-transparent transition-all group"
              >
                <span className="opacity-70 group-hover:opacity-100 transition-opacity">
                  <CategoryIcon icon={q.icon} />
                </span>
                <span className="text-foreground/80 group-hover:text-foreground transition-colors">
                  {q.question}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}
