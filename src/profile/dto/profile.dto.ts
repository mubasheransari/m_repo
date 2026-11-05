import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEnum, IsLatitude, IsLongitude,
  IsOptional, IsString, Matches, MaxLength, ValidateNested, ArrayMinSize, IsInt, Min, Max,
} from 'class-validator';
import { THEME_KEY_RE } from '../../common/theme';

export enum GenderDto { MALE = 'MALE', FEMALE = 'FEMALE' }
export enum SectDto { SUNNI = 'SUNNI', SHIA = 'SHIA', JUST_MUSLIM = 'JUST_MUSLIM', OTHER = 'OTHER' }
export enum ReligiousnessDto { VERY_PRACTISING = 'VERY_PRACTISING', PRACTISING = 'PRACTISING', MODERATE = 'MODERATE', LEARNING = 'LEARNING' }
export enum TimelineDto { ASAP = 'ASAP', WITHIN_6_MONTHS = 'WITHIN_6_MONTHS', WITHIN_1_YEAR = 'WITHIN_1_YEAR', WITHIN_2_YEARS = 'WITHIN_2_YEARS', NOT_SURE = 'NOT_SURE' }

export class UpsertProfileDto {
  @IsOptional() @IsString() @MaxLength(40) firstName?: string;
  @IsOptional() @IsEnum(GenderDto) gender?: GenderDto;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() @MaxLength(600) bio?: string;
  @IsOptional() @IsString() @MaxLength(80) city?: string;
  @IsOptional() @IsString() @MaxLength(80) country?: string;
  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;
  @IsOptional() @IsEnum(SectDto) sect?: SectDto;
  @IsOptional() @IsEnum(ReligiousnessDto) religiousness?: ReligiousnessDto;
  @IsOptional() @IsString() @MaxLength(80) education?: string;
  @IsOptional() @IsString() @MaxLength(80) profession?: string;
  @IsOptional() @IsString() @MaxLength(60) ethnicity?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) languages?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(15) @IsString({ each: true }) interests?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) lifestyle?: string[];
  @IsOptional() @IsString() @MaxLength(300) marriageIntention?: string;
  @IsOptional() @IsEnum(TimelineDto) marriageTimeline?: TimelineDto;
  @IsOptional() @IsBoolean() wantsChildren?: boolean;
}

export class UpdatePrivacyDto {
  @IsOptional() @IsBoolean() hideProfile?: boolean;
  @IsOptional() @IsBoolean() invisibleMode?: boolean;
  @IsOptional() @IsBoolean() blurPhotos?: boolean;
  @IsOptional() @IsBoolean() showDistance?: boolean;
  @IsOptional() @IsBoolean() allowScreenshots?: boolean;
  @IsOptional() @IsBoolean() allowNearbyMessages?: boolean;
  @IsOptional() @IsBoolean() allowDirectMessages?: boolean;
}

export class IcebreakerItemDto {
  @IsString() @MaxLength(120) question: string;
  @IsString() @MaxLength(300) answer: string;
}

export class SetIcebreakersDto {
  @IsArray() @ArrayMinSize(0) @ArrayMaxSize(3)
  @ValidateNested({ each: true }) @Type(() => IcebreakerItemDto)
  items: IcebreakerItemDto[];
}

export class SetThemeDto {
  /** A preset key (rose, ocean, ...) or a custom #RRGGBB. null goes back to the default. */
  @IsOptional() @IsString() @Matches(THEME_KEY_RE, { message: 'Unknown theme' }) themeKey?: string | null;
}

export class VisitorsQueryDto {
  /** How many visitors to return (default 50, max 100). */
  @IsOptional() @Transform(({ value }) => (value === undefined ? undefined : Number(value))) @IsInt() @Min(1) @Max(100) limit?: number;
}
