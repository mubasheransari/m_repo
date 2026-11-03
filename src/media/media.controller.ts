import {
  BadRequestException, Body, Controller, Delete, Param, ParseUUIDPipe, Patch, Post,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { randomUUID } from 'crypto';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MediaService } from './media.service';
import { EXT_BY_MIME, uploadDir } from './upload-dir';

const MIME: Record<string, string[]> = {
  photo: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/quicktime'],
  voice: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/m4a', 'audio/x-m4a', 'audio/wav', 'audio/webm', 'audio/ogg'],
};
const EXT: Record<string, string[]> = {
  photo: ['.jpg', '.jpeg', '.png', '.webp'],
  video: ['.mp4', '.mov'],
  voice: ['.mp3', '.m4a', '.aac', '.wav', '.webm', '.ogg'],
};
const MAX_MB: Record<string, number> = { photo: 10, video: 50, voice: 10 };

function uploader(kind: 'photo' | 'video' | 'voice') {
  return FileInterceptor('file', {
    storage: diskStorage({
      // Resolved per request so it always matches the folder the static file server reads from.
      destination: (_req, _file, cb) => cb(null, uploadDir()),
      filename: (_req, file, cb) => {
        // Trust the extension only if it is valid for this kind of file; otherwise derive it from the MIME type,
        // so a photo without (or with a wrong) extension is still stored and served with the right content type.
        const ext = extname(file.originalname).toLowerCase();
        cb(null, `${randomUUID()}${EXT[kind].includes(ext) ? ext : EXT_BY_MIME[file.mimetype] ?? ext}`);
      },
    }),
    limits: { fileSize: MAX_MB[kind] * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const okMime = MIME[kind].includes(file.mimetype);
      const okExt = file.mimetype === 'application/octet-stream' && EXT[kind].includes(extname(file.originalname).toLowerCase());
      okMime || okExt ? cb(null, true) : cb(new BadRequestException(`Unsupported ${kind} format`), false);
    },
  });
}

class PhotoBodyDto {
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() isPrivate?: boolean;
}
class UpdateMediaDto {
  @IsOptional() @IsBoolean() isPrivate?: boolean;
  @IsOptional() @IsInt() @Min(0) position?: number;
}

@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(private media: MediaService) {}

  private need(f?: Express.Multer.File) { if (!f) throw new BadRequestException('Attach a file in the "file" field'); return f; }

  @Post('photos') @UseInterceptors(uploader('photo'))
  photo(@CurrentUser() u: AuthUser, @UploadedFile() f: Express.Multer.File, @Body() b: PhotoBodyDto) {
    return this.media.add(u.id, 'PHOTO', this.need(f), b.isPrivate);
  }
  @Post('video') @UseInterceptors(uploader('video'))
  video(@CurrentUser() u: AuthUser, @UploadedFile() f: Express.Multer.File) { return this.media.add(u.id, 'VIDEO', this.need(f)); }

  @Post('voice-intro') @UseInterceptors(uploader('voice'))
  voice(@CurrentUser() u: AuthUser, @UploadedFile() f: Express.Multer.File) { return this.media.add(u.id, 'VOICE', this.need(f)); }

  @Patch(':id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateMediaDto) { return this.media.update(u.id, id, dto); }

  @Delete(':id')
  remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.media.remove(u.id, id); }
}
