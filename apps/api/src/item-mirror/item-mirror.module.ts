import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from '../item/item.entity';
import { ItemMirrorService } from './item-mirror.service';
import { ItemMirrorAdminController } from './item-mirror-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Item])],
  controllers: [ItemMirrorAdminController],
  providers: [ItemMirrorService],
  exports: [ItemMirrorService],
})
export class ItemMirrorModule {}
