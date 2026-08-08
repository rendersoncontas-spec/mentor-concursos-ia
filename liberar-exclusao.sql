-- Ativar a exclusão para o dono do registro na tabela user_disciplines
CREATE POLICY "Users can delete their own disciplines" 
ON user_disciplines
FOR DELETE 
USING (auth.uid() = user_id);
