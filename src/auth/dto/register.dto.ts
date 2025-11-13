import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { IsCPF } from '../../common/validators/cpf.validator';

export class RegisterDto {
  @IsNotEmpty({ message: 'Nome é obrigatório' })
  @IsString()
  name: string;

  @IsNotEmpty({ message: 'Email é obrigatório' })
  @IsEmail({}, { message: 'Email inválido' })
  email: string;

  @IsNotEmpty({ message: 'Senha é obrigatória' })
  @IsString()
  @MinLength(6, { message: 'Senha deve ter no mínimo 6 caracteres' })
  password: string;

  @IsNotEmpty({ message: 'CPF é obrigatório' })
  @IsString()
  @IsCPF()
  cpf: string;
}
