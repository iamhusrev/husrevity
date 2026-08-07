import { Injectable, PipeTransform } from '@nestjs/common';
import { ApiException } from './api.exception';

const NUMERIC_ID_RE = /^\d+$/;

/**
 * Validates route params that carry bigint-as-string ids (see BaseEntity.id).
 * Deliberately NOT ParseIntPipe — a plain number would lose precision above
 * 2^53, which real bigint PKs can exceed. Passes the string through unchanged.
 */
@Injectable()
export class NumericIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!NUMERIC_ID_RE.test(value)) {
      throw ApiException.badRequest('Invalid id');
    }
    return value;
  }
}
