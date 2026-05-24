"use client";

import { EyeCloseIcon, EyeIcon } from "@/icons";
import { useAuth } from "@/providers/AuthProvider";

import Button from "@/components/button/Button";
import FormFieldText from "@/components/form/FormFieldText";
import { alertStore } from "@/stores/alert-store";
import { parseAxiosError } from "@/utils/handleError";
import { LOGIN_PAGE } from "@/utils/constants-url";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

export type RegisterSchema = {
  firstName?: string;
  lastName?: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export default function SignUp() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const showAlert = alertStore((state) => state.show);

  const [showPassword, setShowPassword] = useState(false);

  const schema = useMemo(
    () =>
      z
        .object({
          firstName: z.string().optional(),
          lastName: z.string().optional(),
          email: z.string().email(t("auth.validEmail")),
          password: z.string().min(8, t("auth.passwordMin")),
          confirmPassword: z.string().min(8, t("auth.passwordMin")),
        })
        .refine((d) => d.password === d.confirmPassword, {
          path: ["confirmPassword"],
          message: t("auth.passwordMismatch"),
        }),
    [t],
  );

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<RegisterSchema>({
    mode: "onBlur",
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (data: RegisterSchema) => {
    try {
      await register(data);
      showAlert({
        title: t("auth.registerSuccessTitle"),
        message: t("auth.registerSuccessMessage"),
        type: "success",
        position: "top-center",
      });
    } catch (error) {
      const { title, message } = parseAxiosError(error);
      showAlert({ title, message, type: "error", position: "top-center" });
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="flex flex-col w-full">
        <div>
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              {t("auth.createAccount")}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t("auth.welcomeText")}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormFieldText control={control} name="firstName" label={t("auth.firstName")} />
                <FormFieldText control={control} name="lastName" label={t("auth.lastName")} />
              </div>

              <FormFieldText
                control={control}
                name="email"
                label={t("landing.contact.email")}
                required
                placeholder={t("auth.emailPlaceholder")}
              />

              <div className="relative">
                <FormFieldText
                  control={control}
                  name="password"
                  label={t("auth.password")}
                  required
                  type={showPassword ? "text" : "password"}
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

              <FormFieldText
                control={control}
                name="confirmPassword"
                label={t("auth.confirmPassword")}
                required
                type={showPassword ? "text" : "password"}
              />

              <div>
                <Button className="w-full" size="sm" disabled={isSubmitting}>
                  {isSubmitting ? t("auth.signingUp") : t("auth.signUpButton")}
                </Button>
              </div>

              <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                {t("auth.haveAccount")}{" "}
                <Link
                  href={LOGIN_PAGE}
                  className="text-brand-500 hover:text-brand-600 dark:text-brand-400"
                >
                  {t("auth.signInHere")}
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
