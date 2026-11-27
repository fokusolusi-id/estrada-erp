UPDATE "org_unit" SET "parent_code" = 'PST', "type" = 'department' WHERE "code" IN ('DEVOPS', 'PDA', 'PITS') AND "parent_code" = 'DIR';
