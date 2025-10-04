# Summarizes the text / transcript to a dense summary.
# Some important factors to consider:
# - The summary should be concise and information dense, but we don't want to lose any important information. We want to investigate Chain-of-Density prompting for this.
# - The actual output here should be an object including some fields such as: claims, entities, key points, dates, metrics, topics, etc.
# - Essentially, we should have the dense summary but also include key information to ensure they don't miss any important information.
# - Ideally, we want to keep timestamp-citations for each line of the dense summary. It should cite a timestamp range for each line of the dense summary.
from llm.gemini import query_gemini

text="""Graveyards, sheep farms and garden lawns are among the hundreds of new sites for rare pink and purple fungi discovered by citizen scientists.
The charity Plantlife has enlisted 850 volunteers to look for waxcaps in their local areas, so scientists can get data from places such as private gardens to which they have not previously had access.
They found 300 new locations of the candy-coloured pink waxcap (Porpolomopsis calyptriformis), which is classed as “vulnerable” on the global International Union for Conservation of Nature (IUCN red list of threatened species, and 18 new locations of the vibrant violet coral, Clavaria zollingeri.
“Last year was our biggest year ever for the citizen science surveys,” said Dr Aileen Baird, senior fungi conservation officer at Plantlife. “People’s interest in fungi is definitely growing, and we wouldn’t have found these new locations without them.”
Before the survey, just over 1,000 pink waxcap and 183 violet coral sites were recorded in the British Mycological Society’s database, so the new findings have significantly expanded the data.
Baird added that there was a “relatively high number” of these fungi in the UK despite them being internationally rare, as they thrive in a type of nutrient-poor ancient grassland that is found in Britain.
“They are internationally vulnerable which puts them in the same category as snow leopards and giant pandas in terms of their extinction risk. So we have a international responsibility in the UK to protect these fungi,” she said.
She added that they were “very beautiful” and an indicator of these increasingly rare ancient grasslands. “They’re a habitat that we’re losing massive amounts of and so these fungi can also be a really good way of us finding out where these remnants of ancient grasslands are.”
This habitat has been lost to development and farming, as well as tree-planting, as the fungi need grassland rather than woodland habitats. “There can be a bit of a clash there, because obviously, 
tree planting on the whole is a positive thing, but it needs to be in the right places. And so it’s that change of land use and intensive farming. The fungi don’t like fertiliser and fungicides and other kinds of pesticides and things like ploughing and soil disturbance. All of those can negatively impact these fungi."""

prompt="""Convert the following text into a concise and information-dense summary, ensuring that all key points, 
claims, entities, dates, metrics, and topics are captured. \n\nText:\n{text}\n\nSummary:"""

def summarize(text):
    summary = query_gemini(prompt.format(text=text))
    return summary

result = summarize(text)
print(result)