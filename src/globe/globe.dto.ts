import { IsBoolean, IsLatitude, IsLongitude, IsOptional } from 'class-validator';

export class SetGlobeDto {
  @IsBoolean() enabled: boolean;
  /** Required when enabled is true: where to place the member on the globe. */
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
}
