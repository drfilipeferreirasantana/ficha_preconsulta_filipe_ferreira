# Declaração de Intenção e Fé — Mineração Solo SHA-256

Registro cronológico público da declaração de **Filipe Ferreira Santana**,
feita em **12 de outubro de 2026, 21:24 (horário de Brasília)**.

O texto da declaração está em [`declaracao.txt`](declaracao.txt), gravado
byte a byte como foi declarado. Este arquivo apenas o acompanha: registra o
hash, a forma de verificá-lo e o que esse registro prova.

---

## Texto declarado

> DECLARAÇÃO DE INTENÇÃO E FÉ - MINERAÇÃO SOLO SHA-256
>
> Minerador: Filipe Ferreira Santana
> Data e Hora da Declaração: 12 de Outubro de 2026, 21:24 (Horário de Brasília)
> Hardware/Poder de Processamento Declarado: 18.49 MH/s
> Alvo: Rede SHA-256 (Bitcoin / Bloco Solo)
> Probabilidade Discutida: ~1 em 54 trilhões por bloco (1 bilhão de anos estimados)
> Propósito: Prova cronológica de que o minerador estava plenamente ciente da
> impossibilidade matemática e estatística de encontrar um bloco solo com o
> hardware atual, atribuindo qualquer eventual sucesso futuro unicamente à sua
> fé e a um milagre manifesto.

---

## Impressão digital (SHA-256)

Hash do arquivo `declaracao.txt` (620 bytes, UTF-8, terminações de linha LF):

```
31811779f4abb0f9ccc23fb3bd306fac0e8c1c8a4224f7c03c71d92db8d7fff9
```

### Como qualquer pessoa confere

No Linux ou macOS:

```bash
sha256sum declaracao/declaracao.txt
```

No Windows (PowerShell):

```powershell
Get-FileHash declaracao\declaracao.txt -Algorithm SHA256
```

Se um único byte do texto mudar, o hash muda por completo. É isso que amarra
este registro ao conteúdo exato que foi declarado.

---

## Hash informado pelo declarante

O declarante apresentou, junto ao texto, o seguinte valor:

```
1e6c3a91bb589c4a4abde767d482c2a81dbdf43911d1cf70962262e00eec6f72
```

Esse valor **não corresponde** ao SHA-256 do texto declarado. Foram testadas
64 formas canônicas plausíveis do mesmo conteúdo — com e sem a linha de
título, terminações `LF` e `CRLF`, com e sem quebra de linha final, nas
codificações UTF-8, UTF-8 com BOM, Latin-1 e CP1252 — e nenhuma o reproduz.

Ele fica registrado aqui como **declarado pelo autor**, sem afirmação sobre o
que representa. A origem pode ser outro documento, outra versão do texto, ou
outro dado qualquer; apenas o próprio declarante pode esclarecer.

O hash que de fato corresponde a este documento é o da seção anterior.

---

## O que este registro prova, e o que não prova

**Prova:** que este texto existia, nesta forma exata, em data não posterior à
do commit que o introduziu neste repositório. O commit do Git carrega
carimbo de data e hora e um identificador que é um hash do conteúdo somado ao
do commit anterior — encadeado, como os blocos de uma cadeia. Publicado no
GitHub, passa a ter testemunha externa: não é possível reescrever a data sem
que a alteração fique evidente.

**Não prova:** a hora exata declarada (21:24), que é afirmação do próprio
autor, nem qualquer fato sobre a mineração em si.

### Ancoragem mais forte, se desejada

Para prova de data independente de qualquer empresa ou servidor, existe o
[OpenTimestamps](https://opentimestamps.org), que insere o hash de um arquivo
dentro de uma transação na própria blockchain do Bitcoin. A partir daí, a data
passa a ser garantida pela mesma rede SHA-256 citada na declaração — o que tem
simetria evidente com o propósito deste documento.

---

## Nota sobre a probabilidade declarada

A declaração cita "~1 em 54 trilhões por bloco". A probabilidade real por
bloco é `(taxa do minerador × 600 s) ÷ (taxa total da rede × 600 s)`, ou
seja, a fração que 18,49 MH/s representa da potência total da rede — número
que muda a cada ajuste de dificuldade, a cada duas semanas. A ordem de
grandeza da declaração é compatível com a conclusão que ela mesma expressa
(a de impossibilidade prática), e a conclusão não depende do valor exato.

O ponto central da declaração — ciência plena da impossibilidade estatística,
e atribuição de qualquer êxito à fé — fica registrado sem ressalva.
