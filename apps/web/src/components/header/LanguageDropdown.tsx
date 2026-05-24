"use client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FaChevronDown } from "react-icons/fa";
import { Dropdown } from "../dropdown/Dropdown";
import { DropdownItem } from "../dropdown/DropdownItem";

interface Language {
  code: string;
  name: string;
  flag: string;
}

const languages: Language[] = [
  { code: "en", name: "English", flag: "EN" },
  { code: "tr", name: "Türkçe", flag: "TR" },
];

export default function LanguageDropdown() {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const currentLanguage = languages.find((lang) => lang.code === i18n.language) || languages[0];

  function toggleDropdown() {
    setIsOpen(!isOpen);
  }

  function closeDropdown() {
    setIsOpen(false);
  }

  function handleLanguageChange(lng: string) {
    i18n.changeLanguage(lng);
    closeDropdown();
  }

  return (
    <div className="relative">
      <button
        onClick={toggleDropdown}
        className="flex items-center dropdown-toggle gap-1.5 text-gray-700 dark:text-gray-400 dropdown-toggle relative justify-center bg-white dark:bg-gray-dark border border-gray-200 dark:border-gray-800 rounded-full h-11 px-3"
      >
        <span className="text-md">{currentLanguage.flag}</span>
        <span>
          <FaChevronDown
            className={`w-3 h-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </span>
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={closeDropdown}
        className="absolute left-0 mt-[17px] flex w-[200px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark"
      >
        <ul className="flex flex-col gap-1">
          {languages.map((language) => (
            <li key={language.code}>
              <DropdownItem
                onItemClick={() => handleLanguageChange(language.code)}
                tag="button"
                className={`flex items-center gap-3 px-3 py-2 font-medium rounded-lg group text-theme-sm w-full text-left ${
                  i18n.language === language.code
                    ? "bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-gray-300"
                    : "text-gray-700 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300"
                }`}
              >
                <span className="text-md">{language.flag}</span>
                <span className="text-sm">{language.name}</span>
              </DropdownItem>
            </li>
          ))}
        </ul>
      </Dropdown>
    </div>
  );
}
