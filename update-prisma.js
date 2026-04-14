const fs = require('fs');
const content = fs.readFileSync('prisma/schema.prisma', 'utf8');
let newContent = content.replace(
  /moaEtudesDecidedAt\s+DateTime\?\n\s+moaEtudesComment\s+String\?\s+@db\.Text/,
  `moaEtudesDecidedAt          DateTime?\n  moaEtudesComment            String?              @db.Text\n\n  requestedMoeResponseDate    DateTime?\n  documents                   FtmDocument[]`
);
newContent += `

model FtmDocument {
  id              String         @id @default(uuid()) @db.Uuid
  ftmId           String         @db.Uuid
  organizationId  String?        @db.Uuid
  name            String
  url             String
  uploadedById    String         @db.Uuid
  createdAt       DateTime       @default(now())

  ftm             FtmRecord      @relation(fields: [ftmId], references: [id], onDelete: Cascade)
  organization    Organization?  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  uploadedBy      User           @relation(fields: [uploadedById], references: [id])

  @@index([ftmId])
}
`;
fs.writeFileSync('prisma/schema.prisma', newContent);
console.log('Done');
