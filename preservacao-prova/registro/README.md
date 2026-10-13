# Registro Público de Integridade de Prova Digital

Este registro serve a **um único propósito**: permitir que qualquer pessoa —
em especial o juízo e a parte contrária — confira que um arquivo apresentado em
processo é exatamente o mesmo que existia na data aqui consignada.

Responsável: **Filipe Ferreira Santana**, advogado, OAB/ES 37.159.

---

## Ao magistrado: como conferir em menos de um minuto

A petição indicará um **código de verificação**, com este formato:

```
P6N3F-G04X4-1B9KT-P1NRC
```

1. Localize, nesta pasta, o arquivo `<CÓDIGO>.json`.
2. Nele estão os resumos criptográficos (SHA-256) dos arquivos preservados e a
   data do registro.
3. Recalcule o resumo do arquivo que está nos autos e compare.

**Se os valores coincidirem**, o arquivo não sofreu alteração alguma desde a data
do registro. **Se divergirem**, ainda que num único bit, o resumo sai
inteiramente diferente — e a divergência fica evidente.

### Recalcular sem instalar nada

Abra a [ferramenta de verificação](../index.html), vá à aba **"Verificar prova"**,
escolha o arquivo e cole o resumo. O arquivo é lido no próprio aparelho e
**não é enviado a servidor algum**.

### Recalcular por linha de comando

No Windows (PowerShell):

```powershell
Get-FileHash "caminho\do\arquivo" -Algorithm SHA256
```

No Linux ou macOS:

```bash
sha256sum "caminho/do/arquivo"
```

---

## Por que este registro não contém a prova em si

Contém **apenas números** — os resumos criptográficos — além de datas e da
inscrição do responsável.

Não contém, e nunca conterá: nome de pessoa, CPF, número de processo, nome de
arquivo, nem o conteúdo preservado. A razão é dupla:

- **Sigilo profissional** (Lei 8.906/94 e Código de Ética e Disciplina da OAB):
  prova de cliente não se publica na internet.
- **LGPD** (Lei 13.709/2018): prova digital costuma conter dado pessoal e,
  com frequência, dado sensível.

O resumo criptográfico resolve esse impasse: é número do qual **não se
reconstrói o conteúdo**. Publicado, dá data certa e demonstra integridade;
publicado, nada revela. O conteúdo da prova vai aos autos pelas vias próprias,
sob sigilo quando cabível.

Até o nome do arquivo fica de fora — porque nome de arquivo costuma revelar o
teor do que deveria permanecer reservado.

---

## O que este registro demonstra, e o que não demonstra

**Demonstra:** que aqueles arquivos, com aqueles resumos exatos, já existiam na
data do registro, e que não foram alterados desde então.

A data é sustentada pelo histórico de versões deste repositório: cada registro
entra por um *commit* datado, cujo identificador é um resumo criptográfico do
conteúdo somado ao do *commit* anterior — encadeados, de modo que a data não se
reescreve sem deixar rastro. Quando houver ancoragem em blockchain, a data passa
a não depender nem deste repositório.

**Não demonstra:** a veracidade intrínseca do conteúdo dos arquivos. Essa se
apura pelo conjunto da prova — procedência, contexto, coerência com os demais
elementos e, se necessário, perícia.

---

## Natureza jurídica — declarada sem reservas

Os termos referidos neste registro são **instrumentos particulares**. Não
possuem fé pública e **não substituem a ata notarial** de que trata o art. 384
do Código de Processo Civil, privativa de tabelião.

O que se oferece aqui é a camada de **integridade e data certa**, verificável
por qualquer pessoa, de modo independente. Onde a prova digital for o cerne da
causa, ou houver risco de perecimento do conteúdo, a ata notarial permanece o
instrumento adequado, e a sua lavratura é recomendada.

---

## Índice de registros

<!-- Cada registro novo entra abaixo, com a data do commit que o publicou. -->

_Nenhum registro publicado até o momento._
