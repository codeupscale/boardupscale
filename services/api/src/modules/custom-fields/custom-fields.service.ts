import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomFieldDefinition } from './entities/custom-field-definition.entity';
import { CustomFieldValue } from './entities/custom-field-value.entity';
import { CreateFieldDefinitionDto } from './dto/create-field-definition.dto';
import { UpdateFieldDefinitionDto } from './dto/update-field-definition.dto';
import { SetFieldValueDto } from './dto/set-field-value.dto';

@Injectable()
export class CustomFieldsService {
  constructor(
    @InjectRepository(CustomFieldDefinition)
    private definitionRepository: Repository<CustomFieldDefinition>,
    @InjectRepository(CustomFieldValue)
    private valueRepository: Repository<CustomFieldValue>,
  ) {}

  async createDefinition(
    organizationId: string,
    projectId: string,
    dto: CreateFieldDefinitionDto,
  ): Promise<CustomFieldDefinition> {
    const existing = await this.definitionRepository.findOne({
      where: { organizationId, projectId, fieldKey: dto.fieldKey },
    });
    if (existing) {
      throw new BadRequestException(
        `A custom field with key "${dto.fieldKey}" already exists in this project`,
      );
    }

    const definition = this.definitionRepository.create({
      organizationId,
      projectId,
      ...dto,
    });
    return this.definitionRepository.save(definition);
  }

  async updateDefinition(
    id: string,
    dto: UpdateFieldDefinitionDto,
  ): Promise<CustomFieldDefinition> {
    const definition = await this.definitionRepository.findOne({
      where: { id },
    });
    if (!definition) {
      throw new NotFoundException('Custom field definition not found');
    }

    Object.assign(definition, dto);
    return this.definitionRepository.save(definition);
  }

  async deleteDefinition(id: string): Promise<void> {
    const definition = await this.definitionRepository.findOne({
      where: { id },
    });
    if (!definition) {
      throw new NotFoundException('Custom field definition not found');
    }
    await this.definitionRepository.remove(definition);
  }

  async getDefinitions(
    organizationId: string,
    projectId: string,
  ): Promise<CustomFieldDefinition[]> {
    return this.definitionRepository.find({
      where: [
        { organizationId, projectId },
        { organizationId, projectId: null as any },
      ],
      order: { position: 'ASC', createdAt: 'ASC' },
    });
  }

  async getDefinitionById(id: string): Promise<CustomFieldDefinition> {
    const definition = await this.definitionRepository.findOne({
      where: { id },
    });
    if (!definition) {
      throw new NotFoundException('Custom field definition not found');
    }
    return definition;
  }

  async setFieldValue(
    issueId: string,
    fieldId: string,
    value: any,
  ): Promise<CustomFieldValue> {
    const definition = await this.getDefinitionById(fieldId);
    this.validateFieldValue(definition, value);

    let fieldValue = await this.valueRepository.findOne({
      where: { issueId, fieldId },
    });

    if (fieldValue) {
      fieldValue.value = value;
    } else {
      fieldValue = this.valueRepository.create({
        issueId,
        fieldId,
        value,
      });
    }

    return this.valueRepository.save(fieldValue);
  }

  async getFieldValues(issueId: string): Promise<CustomFieldValue[]> {
    return this.valueRepository.find({
      where: { issueId },
      relations: ['field'],
      order: { field: { position: 'ASC' } },
    });
  }

  async bulkSetFieldValues(
    issueId: string,
    values: SetFieldValueDto[],
  ): Promise<CustomFieldValue[]> {
    const results: CustomFieldValue[] = [];
    for (const { fieldId, value } of values) {
      const saved = await this.setFieldValue(issueId, fieldId, value);
      results.push(saved);
    }
    return results;
  }

  private validateFieldValue(
    definition: CustomFieldDefinition,
    value: any,
  ): void {
    const { fieldType, options, isRequired } = definition;

    if (isRequired && (value === null || value === undefined || value === '')) {
      throw new BadRequestException(
        `Field "${definition.name}" is required`,
      );
    }

    if (value === null || value === undefined) return;

    switch (fieldType) {
      case 'number':
        if (typeof value !== 'number' && isNaN(Number(value))) {
          throw new BadRequestException(
            `Field "${definition.name}" must be a number`,
          );
        }
        break;

      case 'date':
        if (isNaN(Date.parse(String(value)))) {
          throw new BadRequestException(
            `Field "${definition.name}" must be a valid date`,
          );
        }
        break;

      case 'checkbox':
        if (typeof value !== 'boolean') {
          throw new BadRequestException(
            `Field "${definition.name}" must be a boolean`,
          );
        }
        break;

      case 'url':
        try {
          new URL(String(value));
        } catch {
          throw new BadRequestException(
            `Field "${definition.name}" must be a valid URL`,
          );
        }
        break;

      case 'select':
        if (options && Array.isArray(options)) {
          const validValues = options.map((o: any) => o.value);
          if (!validValues.includes(value)) {
            throw new BadRequestException(
              `Field "${definition.name}" must be one of: ${validValues.join(', ')}`,
            );
          }
        }
        break;

      case 'multi_select':
        if (!Array.isArray(value)) {
          throw new BadRequestException(
            `Field "${definition.name}" must be an array`,
          );
        }
        if (options && Array.isArray(options)) {
          const validValues = options.map((o: any) => o.value);
          for (const v of value) {
            if (!validValues.includes(v)) {
              throw new BadRequestException(
                `Field "${definition.name}" contains invalid option: ${v}`,
              );
            }
          }
        }
        break;

      case 'text':
      case 'user':
        // text and user accept string values
        break;
    }
  }
}
