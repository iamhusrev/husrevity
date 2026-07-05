export interface VaultEntityResponse {
  id: number;
  name: string;
  category?: string | null;
  description?: string | null;
  icon?: string | null;
  color: string;
  itemCount: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface VaultEntityRequest {
  name: string;
  category?: string | null;
  description?: string | null;
  icon?: string | null;
  color?: string;
}

export interface VaultItemResponse {
  id: number;
  entityId: number;
  label: string;
  value: string;
  description?: string | null;
}

export interface VaultItemRequest {
  label: string;
  value: string;
  description?: string | null;
}

export interface VaultItemUpdateRequest {
  label?: string;
  value?: string;
  description?: string | null;
}

// ─── CSV import ─────────────────────────────────────────────────────────────

export interface CsvImportErrorDto {
  row: number;
  message: string;
}

export interface ImportedItemSummaryDto {
  id: string;
  label: string;
}

export interface ImportResultDto {
  totalRows: number;
  successCount: number;
  skippedCount: number;
  errors: CsvImportErrorDto[];
  importedItems: ImportedItemSummaryDto[];
  timestamp: string;
}
