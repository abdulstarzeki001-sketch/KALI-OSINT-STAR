"""Independent RS256 Cloudflare Access JWT verification on the Railway boundary."""
import asyncio
import re
import jwt
from jwt import PyJWKClient

class AccessVerifier:
    def __init__(self,team_domain:str,aud:str,allowed_emails:str=''):
        domain=team_domain.strip().lower()
        tag=aud.strip().lower()
        self.enabled=bool(re.fullmatch(r'[a-z0-9-]+\.cloudflareaccess\.com',domain) and
                          re.fullmatch(r'[a-f0-9]{64}',tag))
        self.issuer='https://'+domain
        self.audience=tag
        self.emails={x.strip().lower() for x in allowed_emails.split(',') if x.strip()}
        self.jwks=PyJWKClient(self.issuer+'/cdn-cgi/access/certs',cache_keys=True,lifespan=300) if self.enabled else None

    async def verify(self,token:str):
        if not self.enabled or not isinstance(token,str) or not 100<len(token)<=8192:
            return None
        try:
            key=await asyncio.to_thread(self.jwks.get_signing_key_from_jwt,token)
            claims=jwt.decode(token,key.key,algorithms=['RS256'],
                issuer=self.issuer,audience=self.audience,
                leeway=60,options={'require':['exp','iat','iss','aud']})
            if claims.get('type')!='app':return None
            email=str(claims.get('email') or '').strip().lower()
            sub=str(claims.get('sub') or '').strip()
            if not email and not sub:return None
            if self.emails and email not in self.emails:return None
            return {'email':email,'sub':sub}
        except Exception:
            return None
