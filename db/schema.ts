import {sqliteTable,text,integer} from 'drizzle-orm/sqlite-core';
export const documents=sqliteTable('documents',{
 id:text('id').primaryKey(),slug:text('slug'),owner:text('owner').notNull(),title:text('title').notNull(),filename:text('filename').notNull(),mime:text('mime').notNull(),size:integer('size').notNull(),objectKey:text('object_key').notNull(),
 documentNumber:text('document_number').notNull(),unifiedNumber:text('unified_number').notNull().default(''),created:text('created').notNull(),status:text('status').notNull().default('سارية'),facility:text('facility').notNull().default(''),cr:text('cr').notNull().default(''),subscription:text('subscription').notNull().default(''),applicant:text('applicant').notNull().default(''),category:text('category').notNull().default('عام'),uploadedAt:text('uploaded_at').notNull(),deleted:integer('deleted').notNull().default(0)
});
export const documentLinks=sqliteTable('document_links',{
 slug:text('slug').primaryKey(),documentId:text('document_id').notNull().references(()=>documents.id)
});
export const branding=sqliteTable('branding',{
 owner:text('owner').primaryKey(),name:text('name').notNull().default('بوابة الملفات'),displayMode:text('display_mode').notNull().default('name'),logoKey:text('logo_key'),logoMime:text('logo_mime'),updatedAt:text('updated_at').notNull()
});

export const portalAccounts=sqliteTable('portal_accounts',{
 id:text('id').primaryKey(),username:text('username').notNull().unique(),email:text('email').notNull().unique(),displayName:text('display_name').notNull(),passwordHash:text('password_hash').notNull(),role:text('role').notNull().default('member'),active:integer('active').notNull().default(1),canAdd:integer('can_add').notNull().default(0),canEdit:integer('can_edit').notNull().default(0),canDelete:integer('can_delete').notNull().default(0)
});
export const portalSettings=sqliteTable('portal_settings',{id:integer('id').primaryKey(),ownerDataId:text('owner_data_id').notNull()});
export const portalSessions=sqliteTable('portal_sessions',{tokenHash:text('token_hash').primaryKey(),accountId:text('account_id').notNull().references(()=>portalAccounts.id),expiresAt:integer('expires_at').notNull()});
export const portalLoginLimits=sqliteTable('portal_login_limits',{key:text('key').primaryKey(),window:integer('window').notNull(),count:integer('count').notNull()});
