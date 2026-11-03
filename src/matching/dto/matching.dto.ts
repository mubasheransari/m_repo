import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsLatitude, IsLongitude, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { ReligiousnessDto, SectDto, TimelineDto } from '../../profile/dto/profile.dto';

export class DiscoverQueryDto {
  @IsOptional() @IsIn(['suggested', 'nearby', 'worldwide', 'close']) mode?: 'suggested' | 'nearby' | 'worldwide' | 'close';
  @IsOptional() @Type(() => Number) @IsInt() @Min(18) @Max(99) minAge?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(18) @Max(99) maxAge?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20000) maxDistanceKm?: number;
  @IsOptional() @IsString() @MaxLength(80) country?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsEnum(SectDto) sect?: SectDto;
  @IsOptional() @IsEnum(ReligiousnessDto) religiousness?: ReligiousnessDto;
  @IsOptional() @IsEnum(TimelineDto) timeline?: TimelineDto;
  @IsOptional() @IsString() @MaxLength(80) education?: string;
  @IsOptional() @IsString() @MaxLength(80) profession?: string;
  @IsOptional() @IsString() @MaxLength(60) ethnicity?: string;
  @IsOptional() @IsString() @MaxLength(40) language?: string;
  @IsOptional() @IsString() @MaxLength(40) interest?: string;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() verifiedOnly?: boolean;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() wantsChildren?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}

export class SwipeDto {
  @IsString() targetId: string;
  @IsIn(['LIKE', 'PASS']) action: 'LIKE' | 'PASS';
}

export class TravelDto {
  @IsString() @MaxLength(80) city: string;
  @IsString() @MaxLength(80) country: string;
  @IsLatitude() latitude: number;
  @IsLongitude() longitude: number;
}
