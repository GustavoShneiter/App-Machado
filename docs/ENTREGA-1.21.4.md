# Gestão 1.21.4 / Profissional 1.3.4

Ícones substituídos pelas duas imagens fornecidas pelo proprietário: GST com fundo verde para Gestão, PRO com fundo claro para Profissional. Originais de 500 × 500 preservados em assets/branding/app-icons; nenhuma arte redesenhada.

Recursos Android em cinco densidades, ícones adaptativos com margem para as máscaras do sistema, ícones web/instalação e apple-touch de cada edição atualizados. Recurso de ícone do projeto iOS de Gestão atualizado; nenhum IPA foi gerado. Navegação, dados, atendimento e agente permanecem com a mesma lógica.

Validação: comparação pixel a pixel dos ícones web com os originais redimensionados, revisão visual das prévias quadradas/circulares, compilação das duas edições, assinatura e versões dos APKs. Microsoft Defender local não detectou ameaças nos APKs completos. Hashes em releases/android/manifest-1.21.4.json. Nenhum arquivo foi enviado a serviço externo de análise.

Geração reproduzível: `python scripts/update-app-icons.py` usa os originais incluídos no repositório. Para substituir as fontes intencionalmente, passe `--admin <arquivo.png> --professional <arquivo.png>`.
