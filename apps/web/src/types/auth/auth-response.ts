import { UserResponse } from "@/types/user/user";

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: UserResponse;
}
