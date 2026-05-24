"use client";

import { EyeCloseIcon, EyeIcon } from "@/icons";
import { useAuth } from "@/providers/AuthProvider";

import Button from "@/components/button/Button";
import FormFieldText from "@/components/form/FormFieldText";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { REGISTER_PAGE } from "@/utils/constants-url";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useTranslation } from "react-i18next";

export type LoginSchema = {
  email: string;
  password: string;
};

export default function SignIn() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const showAlert = alertStore((state) => state.show);

  const [showPassword, setShowPassword] = useState(false);

  const schema = useMemo(
    () =>
      z.object({
        email: z.string().min(1, t("auth.emailRequired")).email(t("auth.validEmail")),
        password: z.string().min(1, t("auth.passwordRequired")),
      }),
    [t],
  );

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<LoginSchema>({
    mode: "onBlur",
    resolver: zodResolver(schema),
    delayError: 100,
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (data: LoginSchema) => {
    try {
      await login(data);

      showAlert({
        title: t("auth.loginSuccessTitle"),
        message: t("auth.loginSuccessMessage"),
        type: "success",
        position: "top-center",
        width: "md",
      });
    } catch (error) {
      const { title, message } = parseAxiosError(error);

      showAlert({
        title,
        message,
        type: "error",
        position: "top-center",
        width: "sm",
      });
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="flex flex-col w-full">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              {t("auth.signInTitle")}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("auth.signInSubtitle")}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-6">
              {/* Email */}
              <FormFieldText
                control={control}
                name="email"
                label={t("landing.contact.email")}
                required
                placeholder={t("auth.emailPlaceholder")}
                id="email"
              />

              {/* Password — eye toggle overlaid */}
              <div className="relative">
                <FormFieldText
                  control={control}
                  name="password"
                  label={t("auth.password")}
                  required
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  id="password"
                />
                <span
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute z-30 cursor-pointer right-4 top-9"
                >
                  {showPassword ? (
                    <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                  ) : (
                    <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                  )}
                </span>
              </div>

              {/* Submit button */}
              <div>
                <Button className="w-full" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? t("auth.signingIn") : t("auth.signInButton")}
                </Button>
              </div>

              <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                {t("auth.noAccount")}{" "}
                <Link
                  href={REGISTER_PAGE}
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  {t("auth.registerHere")}
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
