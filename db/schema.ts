import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const documents=sqliteTable('documents',{
 id:text('id').primaryKey(),owner:text('owner').notNull(),title:text('title').notNull(),filename:text('filename').notNull(),mime:text('mime').notNull(),size:integer('size').notNull(),objectKey:text('object_key').notNull(),
 documentNumber:text('document_number').notNull(),unifiedNumber:text('unified_number').notNull().default(''),created:text('created').notNull(),status:text('status').notNull().default('سارية'),facility:text('facility').notNull().default(''),cr:text('cr').notNull().default(''),subscription:text('subscription').notNull().default(''),applicant:text('applicant').notNull().default(''),category:text('category').notNull().default('عام'),uploadedAt:text('uploaded_at').notNull(),deleted:integer('deleted').notNull().default(0)
});
export const branding=sqliteTable('branding',{
 owner:text('owner').primaryKey(),name:text('name').notNull().default('بوابة الملفات'),displayMode:text('display_mode').notNull().default('name'),logoKey:text('logo_key'),logoMime:text('logo_mime'),updatedAt:text('updated_at').notNull()
});
