import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { join } from 'path';
import { uploadDir } from './media/upload-dir';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  // Same folder the uploader writes to (see media/upload-dir.ts). Images are loaded by the app from another origin.
  app.useStaticAssets(uploadDir(), {
    prefix: '/uploads',
    maxAge: '7d',
    index: false,
    setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
  });

  // Admin panel (plain HTML + JS, no build step): http://localhost:4000/admin-panel/
  app.useStaticAssets(join(__dirname, '..', 'admin-panel'), { prefix: '/admin-panel', index: 'index.html', maxAge: 0 });

  const doc = new DocumentBuilder().setTitle('MIORA API').setVersion('0.1').addBearerAuth().build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, doc));

  const port = Number(process.env.PORT) || 4000;
  await app.listen(port);
  console.log(`MIORA API running on http://localhost:${port}/api  (docs: /docs, admin panel: /admin-panel/)`);
}
bootstrap();
