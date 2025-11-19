# Parser utilities to extract structured content from LLM responses

def parse_email_content(raw_content: str) -> dict:
    """
    Parse email content to extract subject and body.
    Expected format:
    SUBJECT: [subject line]
    ---
    [email body]
    """
    lines = raw_content.strip().split('\n')
    subject = None
    body_lines = []
    found_separator = False
    
    for line in lines:
        if line.strip().startswith('SUBJECT:'):
            subject = line.replace('SUBJECT:', '').strip()
        elif line.strip() == '---':
            found_separator = True
        elif found_separator or (subject and not line.strip().startswith('SUBJECT:')):
            body_lines.append(line)
    
    # If no subject found, use first line or default
    if not subject:
        subject = "Email Draft"
        body = raw_content.strip()
    else:
        body = '\n'.join(body_lines).strip()
    
    return {
        'subject': subject,
        'content': body,
        'to': '[Recipient]'  # Placeholder, can be enhanced later
    }


def parse_linkedin_content(raw_content: str) -> dict:
    """
    Parse LinkedIn content - currently just returns content,
    but can be enhanced to extract hashtags separately.
    """
    return {
        'content': raw_content.strip()
    }


def parse_tiktok_content(raw_content: str) -> dict:
    """
    Parse TikTok content to extract caption and hashtags.
    """
    content = raw_content.strip()
    
    # Try to extract hashtags if present
    lines = content.split('\n')
    caption_lines = []
    hashtags = []
    
    for line in lines:
        # Check if line contains hashtags
        if '#' in line:
            # Extract hashtags from this line
            words = line.split()
            line_hashtags = [word for word in words if word.startswith('#')]
            hashtags.extend(line_hashtags)
            # Keep the line in caption too
            caption_lines.append(line)
        else:
            caption_lines.append(line)
    
    caption = '\n'.join(caption_lines).strip()
    
    return {
        'content': caption,
        'caption': caption,
        'username': '@micra_official',
        'music': 'Original Sound - MiCRA'
    }

