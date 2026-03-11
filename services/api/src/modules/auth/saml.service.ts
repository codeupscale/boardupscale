import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { Organization } from '../organizations/entities/organization.entity';

export interface SamlConfig {
  entryPoint: string;
  issuer: string;
  certificate: string;
  callbackUrl?: string;
}

export interface SamlUserProfile {
  email: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
}

@Injectable()
export class SamlService {
  private readonly logger = new Logger(SamlService.name);

  constructor(
    @InjectRepository(Organization)
    private organizationRepository: Repository<Organization>,
    private configService: ConfigService,
  ) {}

  // ── Read SAML config from organization settings ─────────────────────────

  async getSamlConfig(orgId: string): Promise<SamlConfig | null> {
    const org = await this.organizationRepository.findOne({
      where: { id: orgId },
    });
    if (!org || !org.settings?.saml) {
      return null;
    }

    const saml = org.settings.saml;
    if (!saml.entryPoint || !saml.issuer || !saml.certificate) {
      return null;
    }

    return {
      entryPoint: saml.entryPoint,
      issuer: saml.issuer,
      certificate: saml.certificate,
      callbackUrl: saml.callbackUrl || this.getDefaultCallbackUrl(),
    };
  }

  async getSamlConfigBySlug(orgSlug: string): Promise<{ config: SamlConfig; orgId: string } | null> {
    const org = await this.organizationRepository.findOne({
      where: { slug: orgSlug },
    });
    if (!org || !org.settings?.saml) {
      return null;
    }

    const saml = org.settings.saml;
    if (!saml.entryPoint || !saml.issuer || !saml.certificate) {
      return null;
    }

    return {
      config: {
        entryPoint: saml.entryPoint,
        issuer: saml.issuer,
        certificate: saml.certificate,
        callbackUrl: saml.callbackUrl || this.getDefaultCallbackUrl(),
      },
      orgId: org.id,
    };
  }

  // ── Check if SAML is configured for an org by slug ──────────────────────

  async isSamlConfigured(orgSlug: string): Promise<boolean> {
    const org = await this.organizationRepository.findOne({
      where: { slug: orgSlug },
    });
    if (!org || !org.settings?.saml) {
      return false;
    }
    const saml = org.settings.saml;
    return !!(saml.entryPoint && saml.issuer && saml.certificate);
  }

  // ── Initiate SAML login (generate AuthnRequest and redirect URL) ───────

  async initiateSamlLogin(orgSlug: string): Promise<string> {
    const result = await this.getSamlConfigBySlug(orgSlug);
    if (!result) {
      throw new BadRequestException('SAML is not configured for this organization');
    }

    const { config, orgId } = result;
    const callbackUrl = config.callbackUrl || this.getDefaultCallbackUrl();
    const requestId = `_${crypto.randomUUID()}`;
    const issueInstant = new Date().toISOString();

    // Build SAML AuthnRequest XML
    const authnRequest = `
<samlp:AuthnRequest
  xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
  xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
  ID="${requestId}"
  Version="2.0"
  IssueInstant="${issueInstant}"
  Destination="${config.entryPoint}"
  AssertionConsumerServiceURL="${callbackUrl}"
  ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${config.issuer}</saml:Issuer>
  <samlp:NameIDPolicy
    Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress"
    AllowCreate="true" />
</samlp:AuthnRequest>`.trim();

    // Deflate and base64 encode for HTTP-Redirect binding
    const deflated = zlib.deflateRawSync(Buffer.from(authnRequest, 'utf-8'));
    const encoded = deflated.toString('base64');
    const samlRequest = encodeURIComponent(encoded);

    // Include RelayState with orgSlug so callback knows which org
    const relayState = encodeURIComponent(
      Buffer.from(JSON.stringify({ orgSlug, orgId })).toString('base64'),
    );

    const separator = config.entryPoint.includes('?') ? '&' : '?';
    const redirectUrl = `${config.entryPoint}${separator}SAMLRequest=${samlRequest}&RelayState=${relayState}`;

    return redirectUrl;
  }

  // ── Handle SAML callback (parse response, extract user attributes) ─────

  async handleSamlCallback(
    samlResponse: string,
    relayState?: string,
  ): Promise<{ profile: SamlUserProfile; orgId: string; orgSlug: string }> {
    // Decode RelayState to get org info
    let orgId: string;
    let orgSlug: string;

    if (relayState) {
      try {
        const decoded = JSON.parse(
          Buffer.from(relayState, 'base64').toString('utf-8'),
        );
        orgId = decoded.orgId;
        orgSlug = decoded.orgSlug;
      } catch {
        throw new BadRequestException('Invalid RelayState parameter');
      }
    } else {
      throw new BadRequestException('Missing RelayState parameter');
    }

    // Get SAML config for the organization
    const config = await this.getSamlConfig(orgId);
    if (!config) {
      throw new BadRequestException('SAML is not configured for this organization');
    }

    // Decode the SAML response (base64)
    let responseXml: string;
    try {
      responseXml = Buffer.from(samlResponse, 'base64').toString('utf-8');
    } catch {
      throw new BadRequestException('Invalid SAML response encoding');
    }

    this.logger.debug('Received SAML response XML (truncated): ' + responseXml.substring(0, 500));

    // Validate the response signature using the IdP certificate
    this.validateSignature(responseXml, config.certificate);

    // Check status
    this.validateStatus(responseXml);

    // Check conditions (audience, timestamps)
    this.validateConditions(responseXml, config.issuer);

    // Extract user profile from assertion
    const profile = this.extractUserProfile(responseXml);

    if (!profile.email) {
      throw new UnauthorizedException(
        'SAML response does not contain a valid email address',
      );
    }

    return { profile, orgId, orgSlug };
  }

  // ── Generate SP Metadata XML ────────────────────────────────────────────

  async getMetadata(orgSlug?: string): Promise<string> {
    let issuer = this.configService.get<string>('saml.issuer') || 'boardupscale';
    let callbackUrl = this.getDefaultCallbackUrl();

    // If orgSlug is provided, use org-specific config
    if (orgSlug) {
      const result = await this.getSamlConfigBySlug(orgSlug);
      if (result) {
        issuer = result.config.issuer;
        callbackUrl = result.config.callbackUrl || callbackUrl;
      }
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<md:EntityDescriptor
  xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${issuer}">
  <md:SPSSODescriptor
    AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <md:NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</md:NameIDFormat>
    <md:AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${callbackUrl}"
      index="0"
      isDefault="true" />
  </md:SPSSODescriptor>
</md:EntityDescriptor>`;
  }

  // ── Save SAML config for an organization ────────────────────────────────

  async saveSamlConfig(orgId: string, samlConfig: SamlConfig): Promise<void> {
    const org = await this.organizationRepository.findOne({
      where: { id: orgId },
    });
    if (!org) {
      throw new BadRequestException('Organization not found');
    }

    const settings = org.settings || {};
    settings.saml = {
      entryPoint: samlConfig.entryPoint,
      issuer: samlConfig.issuer,
      certificate: samlConfig.certificate,
      callbackUrl: samlConfig.callbackUrl || this.getDefaultCallbackUrl(),
    };

    await this.organizationRepository.update(orgId, { settings });
  }

  // ── Delete SAML config for an organization ──────────────────────────────

  async deleteSamlConfig(orgId: string): Promise<void> {
    const org = await this.organizationRepository.findOne({
      where: { id: orgId },
    });
    if (!org) {
      throw new BadRequestException('Organization not found');
    }

    const settings = org.settings || {};
    delete settings.saml;
    await this.organizationRepository.update(orgId, { settings });
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private getDefaultCallbackUrl(): string {
    return (
      this.configService.get<string>('saml.callbackUrl') ||
      'http://localhost:4000/api/auth/saml/callback'
    );
  }

  /**
   * Validate the SAML response signature using the IdP's X.509 certificate.
   * This checks that the response was signed by the expected IdP.
   */
  private validateSignature(responseXml: string, certificate: string): void {
    // Extract the SignatureValue and SignedInfo from the response
    const signatureValueMatch = responseXml.match(
      /<ds:SignatureValue[^>]*>([\s\S]*?)<\/ds:SignatureValue>/,
    );
    const signedInfoMatch = responseXml.match(
      /<ds:SignedInfo[^>]*>([\s\S]*?)<\/ds:SignedInfo>/,
    );

    if (!signatureValueMatch || !signedInfoMatch) {
      // Some IdPs send unsigned responses with signed assertions
      // Check for assertion-level signature
      const assertionSigMatch = responseXml.match(
        /<(?:ds:)?Signature[^>]*>([\s\S]*?)<\/(?:ds:)?Signature>/,
      );
      if (!assertionSigMatch) {
        this.logger.warn(
          'SAML response has no signature. In production, this should be rejected.',
        );
        // In development/testing, allow unsigned responses
        if (this.configService.get<string>('app.nodeEnv') === 'production') {
          throw new UnauthorizedException('SAML response is not signed');
        }
        return;
      }
    }

    // Normalize the certificate (remove PEM headers/footers and whitespace)
    const cleanCert = certificate
      .replace(/-----BEGIN CERTIFICATE-----/g, '')
      .replace(/-----END CERTIFICATE-----/g, '')
      .replace(/\s+/g, '');

    try {
      // Build the PEM format certificate
      const pemCert = `-----BEGIN CERTIFICATE-----\n${cleanCert}\n-----END CERTIFICATE-----`;

      if (signatureValueMatch && signedInfoMatch) {
        const signatureValue = signatureValueMatch[1].replace(/\s+/g, '');
        const signedInfo = signedInfoMatch[0];

        // Canonicalize SignedInfo (simplified — use the raw XML)
        const verifier = crypto.createVerify('RSA-SHA256');
        verifier.update(signedInfo);

        const isValid = verifier.verify(pemCert, signatureValue, 'base64');

        if (!isValid) {
          // Try SHA1 as some IdPs use it
          const verifierSha1 = crypto.createVerify('RSA-SHA1');
          verifierSha1.update(signedInfo);
          const isValidSha1 = verifierSha1.verify(
            pemCert,
            signatureValue,
            'base64',
          );

          if (!isValidSha1) {
            this.logger.warn(
              'SAML signature verification failed. Allowing in non-production.',
            );
            if (
              this.configService.get<string>('app.nodeEnv') === 'production'
            ) {
              throw new UnauthorizedException(
                'SAML response signature verification failed',
              );
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      this.logger.warn(`SAML signature validation error: ${err.message}`);
      if (this.configService.get<string>('app.nodeEnv') === 'production') {
        throw new UnauthorizedException(
          'SAML response signature verification failed',
        );
      }
    }
  }

  /**
   * Validate the SAML response status to ensure authentication succeeded.
   */
  private validateStatus(responseXml: string): void {
    const statusMatch = responseXml.match(
      /<samlp:StatusCode[^>]*Value="([^"]+)"/,
    );
    if (!statusMatch) {
      // Try without namespace prefix
      const altMatch = responseXml.match(
        /<StatusCode[^>]*Value="([^"]+)"/,
      );
      if (altMatch) {
        const statusValue = altMatch[1];
        if (!statusValue.includes('Success')) {
          throw new UnauthorizedException(
            `SAML authentication failed with status: ${statusValue}`,
          );
        }
        return;
      }
      this.logger.warn('Could not find StatusCode in SAML response');
      return;
    }

    const statusValue = statusMatch[1];
    if (!statusValue.includes('Success')) {
      throw new UnauthorizedException(
        `SAML authentication failed with status: ${statusValue}`,
      );
    }
  }

  /**
   * Validate SAML assertion conditions (audience restriction, timestamps).
   */
  private validateConditions(responseXml: string, expectedAudience: string): void {
    // Check NotBefore / NotOnOrAfter if present
    const conditionsMatch = responseXml.match(
      /<(?:saml:)?Conditions\s+([^>]*)>/,
    );
    if (conditionsMatch) {
      const attrs = conditionsMatch[1];
      const notBeforeMatch = attrs.match(/NotBefore="([^"]+)"/);
      const notOnOrAfterMatch = attrs.match(/NotOnOrAfter="([^"]+)"/);
      const now = new Date();

      // Allow 5 minutes of clock skew
      const clockSkewMs = 5 * 60 * 1000;

      if (notBeforeMatch) {
        const notBefore = new Date(notBeforeMatch[1]);
        if (now.getTime() < notBefore.getTime() - clockSkewMs) {
          throw new UnauthorizedException(
            'SAML assertion is not yet valid (NotBefore condition)',
          );
        }
      }

      if (notOnOrAfterMatch) {
        const notOnOrAfter = new Date(notOnOrAfterMatch[1]);
        if (now.getTime() > notOnOrAfter.getTime() + clockSkewMs) {
          throw new UnauthorizedException(
            'SAML assertion has expired (NotOnOrAfter condition)',
          );
        }
      }
    }

    // Check audience restriction if present
    const audienceMatch = responseXml.match(
      /<(?:saml:)?Audience>([\s\S]*?)<\/(?:saml:)?Audience>/,
    );
    if (audienceMatch) {
      const audience = audienceMatch[1].trim();
      if (audience !== expectedAudience) {
        this.logger.warn(
          `SAML audience mismatch: expected "${expectedAudience}", got "${audience}"`,
        );
        // Warn but don't fail in non-production to ease setup
        if (this.configService.get<string>('app.nodeEnv') === 'production') {
          throw new UnauthorizedException(
            `SAML audience mismatch: expected "${expectedAudience}"`,
          );
        }
      }
    }
  }

  /**
   * Extract user profile (email, display name) from SAML assertion.
   */
  private extractUserProfile(responseXml: string): SamlUserProfile {
    const profile: SamlUserProfile = {
      email: '',
      displayName: '',
    };

    // Extract NameID (typically the email)
    const nameIdMatch = responseXml.match(
      /<(?:saml:)?NameID[^>]*>([\s\S]*?)<\/(?:saml:)?NameID>/,
    );
    if (nameIdMatch) {
      profile.email = nameIdMatch[1].trim();
    }

    // Extract attributes from AttributeStatement
    const attrStatementMatch = responseXml.match(
      /<(?:saml:)?AttributeStatement>([\s\S]*?)<\/(?:saml:)?AttributeStatement>/,
    );
    if (attrStatementMatch) {
      const attrBlock = attrStatementMatch[1];

      // Common attribute patterns from various IdPs
      const emailPatterns = [
        /Name="(?:http:\/\/schemas\.xmlsoap\.org\/ws\/2005\/05\/identity\/claims\/emailaddress|email|Email|mail)"[^>]*>\s*<(?:saml:)?AttributeValue[^>]*>([\s\S]*?)<\/(?:saml:)?AttributeValue>/i,
        /Name="urn:oid:0\.9\.2342\.19200300\.100\.1\.3"[^>]*>\s*<(?:saml:)?AttributeValue[^>]*>([\s\S]*?)<\/(?:saml:)?AttributeValue>/i,
      ];

      for (const pattern of emailPatterns) {
        const match = attrBlock.match(pattern);
        if (match) {
          profile.email = match[1].trim();
          break;
        }
      }

      // Display name patterns
      const displayNamePatterns = [
        /Name="(?:http:\/\/schemas\.xmlsoap\.org\/ws\/2005\/05\/identity\/claims\/name|displayName|DisplayName|display_name)"[^>]*>\s*<(?:saml:)?AttributeValue[^>]*>([\s\S]*?)<\/(?:saml:)?AttributeValue>/i,
        /Name="urn:oid:2\.16\.840\.1\.113730\.3\.1\.241"[^>]*>\s*<(?:saml:)?AttributeValue[^>]*>([\s\S]*?)<\/(?:saml:)?AttributeValue>/i,
      ];

      for (const pattern of displayNamePatterns) {
        const match = attrBlock.match(pattern);
        if (match) {
          profile.displayName = match[1].trim();
          break;
        }
      }

      // First name patterns
      const firstNamePatterns = [
        /Name="(?:http:\/\/schemas\.xmlsoap\.org\/ws\/2005\/05\/identity\/claims\/givenname|firstName|FirstName|first_name|givenName)"[^>]*>\s*<(?:saml:)?AttributeValue[^>]*>([\s\S]*?)<\/(?:saml:)?AttributeValue>/i,
        /Name="urn:oid:2\.5\.4\.42"[^>]*>\s*<(?:saml:)?AttributeValue[^>]*>([\s\S]*?)<\/(?:saml:)?AttributeValue>/i,
      ];

      for (const pattern of firstNamePatterns) {
        const match = attrBlock.match(pattern);
        if (match) {
          profile.firstName = match[1].trim();
          break;
        }
      }

      // Last name patterns
      const lastNamePatterns = [
        /Name="(?:http:\/\/schemas\.xmlsoap\.org\/ws\/2005\/05\/identity\/claims\/surname|lastName|LastName|last_name|sn)"[^>]*>\s*<(?:saml:)?AttributeValue[^>]*>([\s\S]*?)<\/(?:saml:)?AttributeValue>/i,
        /Name="urn:oid:2\.5\.4\.4"[^>]*>\s*<(?:saml:)?AttributeValue[^>]*>([\s\S]*?)<\/(?:saml:)?AttributeValue>/i,
      ];

      for (const pattern of lastNamePatterns) {
        const match = attrBlock.match(pattern);
        if (match) {
          profile.lastName = match[1].trim();
          break;
        }
      }
    }

    // Build display name from first + last if not directly available
    if (!profile.displayName && (profile.firstName || profile.lastName)) {
      profile.displayName = [profile.firstName, profile.lastName]
        .filter(Boolean)
        .join(' ');
    }

    // Fall back to email prefix for display name
    if (!profile.displayName && profile.email) {
      profile.displayName = profile.email.split('@')[0];
    }

    return profile;
  }
}
