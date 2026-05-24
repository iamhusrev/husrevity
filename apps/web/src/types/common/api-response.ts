export interface ApiResponse<T> {
  success: boolean;
  message: string;
  code: number;
  data: T;
}
