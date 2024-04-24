import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { LoggerService } from '../logger/logger.service';
import { FieldMappingService } from './field-mapping.service';
import {
  DefineTargetFieldDto,
  MapFieldToProviderDto,
} from './dto/create-custom-field.dto';
import { ApiResponse, ApiTags, ApiBody, ApiOperation } from '@nestjs/swagger';

@ApiTags('field-mapping')
@Controller('field-mapping')
export class FieldMappingController {
  constructor(
    private readonly fieldMappingService: FieldMappingService,
    private logger: LoggerService,
  ) {
    this.logger.setContext(FieldMappingController.name);
  }

  @ApiOperation({
    operationId: 'getFieldMappingsEntities',
    summary: 'Retrieve field mapping entities',
  })
  @ApiResponse({ status: 200 })
  @Get('entities')
  getEntities() {
    return this.fieldMappingService.getEntities();
  }

  @ApiOperation({
    operationId: 'getFieldMappings',
    summary: 'Retrieve field mappings',
  })
  @ApiResponse({ status: 200 })
  @Get('attribute')
  getAttributes() {
    return this.fieldMappingService.getAttributes();
  }

  @ApiOperation({
    operationId: 'getFieldMappingValues',
    summary: 'Retrieve field mappings values',
  })
  @ApiResponse({ status: 200 })
  @Get('value')
  getValues() {
    return this.fieldMappingService.getValues();
  }

  @ApiOperation({
    operationId: 'defineTargetField',
    summary: 'Define target Field',
  })
  @ApiBody({ type: DefineTargetFieldDto })
  @ApiResponse({ status: 201 })
  //define target field on our unified model
  @Post('define')
  defineTargetField(@Body() defineTargetFieldDto: DefineTargetFieldDto) {
    return this.fieldMappingService.defineTargetField(defineTargetFieldDto);
  }

  @ApiOperation({ operationId: 'mapField', summary: 'Map Custom Field' })
  @ApiBody({ type: MapFieldToProviderDto })
  @ApiResponse({ status: 201 })
  @Post('map')
  mapFieldToProvider(@Body() mapFieldToProviderDto: MapFieldToProviderDto) {
    return this.fieldMappingService.mapFieldToProvider(mapFieldToProviderDto);
  }

  @ApiOperation({
    operationId: 'getCustomProviderProperties',
    summary: 'Retrieve Custom Properties',
  })
  @ApiResponse({ status: 200 })
  @Get('properties')
  getCustomProperties(
    @Query('linkedUserId') linkedUserId: string,
    @Query('providerId') providerId: string,
    @Query('vertical') vertical: string,
  ) {
    return this.fieldMappingService.getCustomProperties(
      linkedUserId,
      providerId,
      vertical,
    );
  }
}
