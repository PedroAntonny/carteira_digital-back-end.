import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { IsCPF } from '../../common/validators/cpf.validator';

export class TransferDto {
  @IsNotEmpty({ message: 'CPF do destinatário é obrigatório' })
  @IsString()
  @IsCPF({ message: 'CPF do destinatário inválido' })
  recipientCpf: string;

  @IsNotEmpty({ message: 'Valor é obrigatório' })
  @IsNumber({}, { message: 'Valor deve ser um número' })
  @Min(0.01, { message: 'Valor deve ser maior que 0' })
  amount: number;

  @IsOptional()
  @IsString()
  description?: string;
}
