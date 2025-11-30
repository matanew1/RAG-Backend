import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { TrainDataDto } from './train-data.dto/train-data.dto';

export class TrainBatchDto {
  @ApiProperty({
    description: 'Array of training documents',
    type: [TrainDataDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TrainDataDto)
  documents: TrainDataDto[];
}
