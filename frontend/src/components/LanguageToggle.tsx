"use client";

import { useLanguage } from "@/components/LanguageProvider";
import { Button } from "@/components/ui/button";

export function LanguageToggle() {
  const { locale, setLocale } = useLanguage();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground font-medium text-xs"
      onClick={() => setLocale(locale === "fr" ? "en" : "fr")}
      title={locale === "fr" ? "Switch to English" : "Passer en Français"}
    >
      {locale === "fr" ? "FR" : "EN"}
    </Button>
  );
}
